-- Migration 0002: Add idempotency_key column and unique index on (user_id, idempotency_key) to missions table
-- Safe and idempotent to execute.

ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "idempotency_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "missions_user_idempotency_uidx" ON "missions" ("user_id", "idempotency_key");
