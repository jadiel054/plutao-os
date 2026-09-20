import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@plutao/db";
import { eq } from "drizzle-orm";
import { normalizePlanId } from "@plutao/domain";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  // Return 501 Not Configured if Stripe secret is not present in environment
  if (!stripeWebhookSecret) {
    return NextResponse.json(
      {
        error: "Stripe webhook integration is not configured in this environment.",
        code: "STRIPE_NOT_CONFIGURED",
      },
      { status: 501 }
    );
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const eventType = payload.type;

    // Stub handler when STRIPE_WEBHOOK_SECRET exists
    if (eventType === "customer.subscription.created" || eventType === "customer.subscription.updated") {
      const subscription = payload.data?.object;
      const userEmail = subscription?.customer_email || subscription?.metadata?.userEmail;
      const planName = subscription?.metadata?.plan || "caronte";

      if (userEmail) {
        const db = getDb();
        const planId = normalizePlanId(planName);

        await db
          .update(users)
          .set({
            plan: planId,
            updatedAt: new Date(),
          })
          .where(eq(users.email, userEmail));
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[POST /api/billing/webhook]", err);
    return NextResponse.json(
      { error: "Webhook processing error." },
      { status: 500 }
    );
  }
}
