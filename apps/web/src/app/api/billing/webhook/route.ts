import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { users, billingEvents } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/billing/stripe";
import { planIdFromStripePriceId } from "@/lib/billing/plans";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook não configurado.", code: "STRIPE_NOT_CONFIGURED" },
      { status: 501 }
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Assinatura ausente." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[billing/webhook] assinatura inválida", err);
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 400 });
  }

  const db = getDb();

  // Idempotência: pre-check antes de processar.
  // Duplicata → 200 sem reprocessar.
  // Processamento só grava o evento no final; falha → 500 SEM gravar
  // para o retry do Stripe reprocessar de verdade.
  try {
    const existing = await db
      .select({ id: billingEvents.id })
      .from(billingEvents)
      .where(eq(billingEvents.stripeEventId, event.id))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (err) {
    console.error("[billing/webhook] idempotency pre-check", err);
    return NextResponse.json({ error: "Falha ao verificar evento." }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          session.metadata?.userId || session.client_reference_id || null;
        if (!userId) {
          console.warn("[billing/webhook] checkout sem userId", session.id);
          break;
        }

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id ?? null;

        let planId = session.metadata?.planId || "caronte";
        if (subscriptionId) {
          try {
            const stripe = getStripe();
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            const priceId = sub.items.data[0]?.price?.id;
            if (priceId) {
              planId = planIdFromStripePriceId(priceId);
            }
          } catch (e) {
            console.warn("[billing/webhook] retrieve sub failed", e);
          }
        }

        await db
          .update(users)
          .set({
            plan: planId,
            ...(customerId ? { stripeCustomerId: customerId } : {}),
            ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        const priceId = sub.items.data[0]?.price?.id;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

        let targetUserId = userId;
        if (!targetUserId && customerId) {
          const found = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.stripeCustomerId, customerId))
            .limit(1);
          targetUserId = found[0]?.id;
        }
        if (!targetUserId) {
          console.warn("[billing/webhook] subscription.updated sem user", sub.id);
          break;
        }

        const active = sub.status === "active" || sub.status === "trialing";
        const planId =
          active && priceId ? planIdFromStripePriceId(priceId) : "orbita_livre";

        await db
          .update(users)
          .set({
            plan: planId,
            stripeSubscriptionId: active ? sub.id : null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, targetUserId));
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

        let targetUserId = userId;
        if (!targetUserId && customerId) {
          const found = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.stripeCustomerId, customerId))
            .limit(1);
          targetUserId = found[0]?.id;
        }
        if (!targetUserId) break;

        await db
          .update(users)
          .set({
            plan: "orbita_livre",
            stripeSubscriptionId: null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, targetUserId));
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn("[billing/webhook] payment_failed", {
          customer: invoice.customer,
          subscription: invoice.subscription,
          attempt: invoice.attempt_count,
        });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("[billing/webhook] process error", event.type, err);
    // Não grava o evento: Stripe reenvia e reprocessamos.
    return NextResponse.json({ error: "Falha ao processar evento." }, { status: 500 });
  }

  // Só grava após processamento bem-sucedido.
  try {
    await db.insert(billingEvents).values({
      stripeEventId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });
  } catch (err) {
    // Race: outro worker pode ter inserido entre o pre-check e aqui.
    // Se UNIQUE violou, tratar como duplicata já processada.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("billing_events_stripe_event_id")) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[billing/webhook] insert after process", err);
    // Processamento já ocorreu; devolver 200 para não reprocessar side-effects.
    // O evento ficará sem registro até próximo ciclo manual se necessário.
    return NextResponse.json({ received: true, recorded: false });
  }

  return NextResponse.json({ received: true });
}
