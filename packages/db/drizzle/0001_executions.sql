-- Additive: Durable Runtime executions (Phase 3)
-- Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mission_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "current_task_id" uuid,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "checkpoint_at" timestamp with time zone,
  "idempotency_key" text NOT NULL,
  "error" text,
  "started_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "executions" ADD CONSTRAINT "executions_mission_id_missions_id_fk"
    FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "executions" ADD CONSTRAINT "executions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "executions_mission_id_idx" ON "executions" ("mission_id");
CREATE INDEX IF NOT EXISTS "executions_user_id_idx" ON "executions" ("user_id");
CREATE INDEX IF NOT EXISTS "executions_status_idx" ON "executions" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "executions_idempotency_key_uidx" ON "executions" ("idempotency_key");
