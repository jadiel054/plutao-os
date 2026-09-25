/**
 * Catálogo de checkout Stripe — price IDs só via env (server-side).
 * Todos os tiers fundador ativam o plano de produto `caronte`.
 */

import type { PlanId } from "@plutao/domain";

export type CheckoutPlanSlug = "founder_19" | "founder_29" | "founder_39";

export type CheckoutPlan = {
  slug: CheckoutPlanSlug;
  /** PlanId gravado em users.plan após pagamento */
  planId: PlanId;
  label: string;
  priceMonthly: number;
  /** Env key que carrega o Stripe Price ID */
  priceEnvKey: "STRIPE_PRICE_FOUNDER19" | "STRIPE_PRICE_FOUNDER29" | "STRIPE_PRICE_FOUNDER39";
};

export const CHECKOUT_PLANS: Record<CheckoutPlanSlug, CheckoutPlan> = {
  founder_19: {
    slug: "founder_19",
    planId: "caronte",
    label: "Caronte Fundador — R$ 19/mês",
    priceMonthly: 19,
    priceEnvKey: "STRIPE_PRICE_FOUNDER19",
  },
  founder_29: {
    slug: "founder_29",
    planId: "caronte",
    label: "Caronte Fundador — R$ 29/mês",
    priceMonthly: 29,
    priceEnvKey: "STRIPE_PRICE_FOUNDER29",
  },
  founder_39: {
    slug: "founder_39",
    planId: "caronte",
    label: "Caronte Fundador — R$ 39/mês",
    priceMonthly: 39,
    priceEnvKey: "STRIPE_PRICE_FOUNDER39",
  },
};

export function isCheckoutPlanSlug(value: unknown): value is CheckoutPlanSlug {
  return typeof value === "string" && value in CHECKOUT_PLANS;
}

export function getCheckoutPlan(slug: CheckoutPlanSlug): CheckoutPlan {
  return CHECKOUT_PLANS[slug];
}

/** Resolve Stripe Price ID a partir do env. Lança se ausente. */
export function resolveStripePriceId(slug: CheckoutPlanSlug): string {
  const plan = CHECKOUT_PLANS[slug];
  const priceId = process.env[plan.priceEnvKey]?.trim();
  if (!priceId) {
    throw new Error(`Preço Stripe não configurado (${plan.priceEnvKey}).`);
  }
  return priceId;
}

/** Mapeia price ID do Stripe → slug de checkout (para webhook). */
export function planSlugFromStripePriceId(priceId: string): CheckoutPlanSlug | null {
  for (const plan of Object.values(CHECKOUT_PLANS)) {
    const envPrice = process.env[plan.priceEnvKey]?.trim();
    if (envPrice && envPrice === priceId) return plan.slug;
  }
  return null;
}

export function planIdFromStripePriceId(priceId: string): PlanId {
  const slug = planSlugFromStripePriceId(priceId);
  if (slug) return CHECKOUT_PLANS[slug].planId;
  return "orbita_livre";
}
