-- 0027_artemis_tasks
-- Durable ARTEMIS dispatch records. Safe to re-run; runtime bootstrap mirrors this shape.
CREATE TABLE IF NOT EXISTS "artemis_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "mission_id" uuid,
  "execution_id" uuid,
  "node_id" text,
  "executor" text DEFAULT 'artemis' NOT NULL,
  "nonce" text NOT NULL,
  "prompt" text NOT NULL,
  "device_serial" text NOT NULL,
  "profile" text DEFAULT 'flash' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "github_run_id" text,
  "github_run_attempt" integer,
  "gate_id" uuid,
  "trace_url" text,
  "summary" text,
  "error" text,
  "cancel_reason" text,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "artemis_tasks_status_check"
    CHECK ("status" IN ('pending', 'running', 'done', 'failed', 'timeout', 'cancelled')),
  CONSTRAINT "artemis_tasks_executor_check"
    CHECK ("executor" IN ('artemis', 'maestro', 'appium', 'playwright', 'androidworld'))
);

DO $$ BEGIN
  ALTER TABLE "artemis_tasks"
    ADD CONSTRAINT "artemis_tasks_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "artemis_tasks"
    ADD CONSTRAINT "artemis_tasks_mission_id_missions_id_fk"
    FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "artemis_tasks"
    ADD CONSTRAINT "artemis_tasks_execution_id_executions_id_fk"
    FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "artemis_tasks"
    ADD CONSTRAINT "artemis_tasks_gate_id_write_gates_id_fk"
    FOREIGN KEY ("gate_id") REFERENCES "public"."write_gates"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "artemis_tasks_nonce_uidx"
  ON "artemis_tasks" USING btree ("nonce");
CREATE INDEX IF NOT EXISTS "artemis_tasks_user_id_idx"
  ON "artemis_tasks" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "artemis_tasks_mission_id_idx"
  ON "artemis_tasks" USING btree ("mission_id");
CREATE INDEX IF NOT EXISTS "artemis_tasks_execution_id_idx"
  ON "artemis_tasks" USING btree ("execution_id");
CREATE INDEX IF NOT EXISTS "artemis_tasks_status_idx"
  ON "artemis_tasks" USING btree ("status");
CREATE INDEX IF NOT EXISTS "artemis_tasks_device_status_idx"
  ON "artemis_tasks" USING btree ("device_serial", "status");
CREATE INDEX IF NOT EXISTS "artemis_tasks_executor_status_idx"
  ON "artemis_tasks" USING btree ("executor", "status");
