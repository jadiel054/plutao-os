-- Persistent rate limiting and write-gate expiry/reaper support.
CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "key" text PRIMARY KEY,
  "window_started_at" timestamp with time zone NOT NULL,
  "hits" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "write_gates"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

-- Existing gates receive a bounded validity period before becoming NOT NULL.
UPDATE "write_gates"
SET "expires_at" = COALESCE("decided_at", "created_at") + interval '15 minutes'
WHERE "expires_at" IS NULL;

ALTER TABLE "write_gates"
  ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '15 minutes'),
  ALTER COLUMN "expires_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "write_gates_status_expires_idx"
  ON "write_gates" ("status", "expires_at");
CREATE INDEX IF NOT EXISTS "rate_limit_buckets_updated_idx"
  ON "rate_limit_buckets" ("updated_at");
