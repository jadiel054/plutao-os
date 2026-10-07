import type { PlanId } from "@plutao/domain";

/**
 * A locked entitlement is authoritative outside Stripe. Billing events may still
 * update subscription/customer identifiers, but must not downgrade or replace
 * the user's product plan.
 */
export function planFieldForBillingEvent(
  plan: PlanId,
  planLocked: boolean,
): { plan?: PlanId } {
  return planLocked ? {} : { plan };
}
