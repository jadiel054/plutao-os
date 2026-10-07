-- Migration 0023: protected plan entitlement
-- Additive/idempotent. The owner account is locked separately by an explicit production operation.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.plan_locked IS
  'When true, billing webhooks may sync Stripe identifiers but must not change users.plan.';
