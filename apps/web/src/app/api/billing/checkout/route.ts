import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@plutao/db";
import { getDb } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getStripe, getAppUrl } from "@/lib/billing/stripe";
import {
  isCheckoutPlanSlug,
  getCheckoutPlan,
  resolveStripePriceId,
} from "@/lib/billing/plans";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: "Faça login para assinar um plano.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    console.error("[POST /api/billing/checkout auth]", err);
    return NextResponse.json({ error: "Erro de autenticação." }, { status: 500 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const planSlug = body.planSlug;

    if (!isCheckoutPlanSlug(planSlug)) {
      return NextResponse.json(
        { error: "Plano inválido. Use founder_19, founder_29 ou founder_39." },
        { status: 400 }
      );
    }

    const catalog = getCheckoutPlan(planSlug);
    let priceId: string;
    try {
      priceId = resolveStripePriceId(planSlug);
    } catch (e) {
      console.error("[checkout] price env missing", e);
      return NextResponse.json(
        { error: "Billing ainda não configurado neste ambiente." },
        { status: 503 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      return NextResponse.json(
        { error: "Billing ainda não configurado neste ambiente." },
        { status: 503 }
      );
    }

    const db = getDb();
    const stripe = getStripe();
    const appUrl = getAppUrl();

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    let customerId = row.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: row.email,
        name: row.name ?? undefined,
        metadata: { userId: row.id },
      });
      customerId = customer.id;
      await db
        .update(users)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(users.id, row.id));
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: row.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/planos/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/planos?canceled=1`,
      metadata: {
        userId: row.id,
        planSlug: catalog.slug,
        planId: catalog.planId,
      },
      subscription_data: {
        metadata: {
          userId: row.id,
          planSlug: catalog.slug,
          planId: catalog.planId,
        },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe não retornou URL de checkout." },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[POST /api/billing/checkout]", err);
    return NextResponse.json(
      { error: "Falha ao iniciar checkout." },
      { status: 500 }
    );
  }
}
