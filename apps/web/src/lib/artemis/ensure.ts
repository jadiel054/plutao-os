import { neon } from "@neondatabase/serverless";

let ensured = false;

/** Idempotent bootstrap for deploys where the migration has not been applied yet. */
export async function ensureArtemisTasksTable(): Promise<void> {
  if (ensured) return;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = neon(url);
  await sql`
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
      CONSTRAINT "artemis_tasks_status_check" CHECK ("status" IN ('pending', 'running', 'done', 'failed', 'timeout', 'cancelled')),
      CONSTRAINT "artemis_tasks_executor_check" CHECK ("executor" IN ('artemis', 'maestro', 'appium', 'playwright', 'androidworld'))
    )
  `;
  await sql`ALTER TABLE "artemis_tasks" ADD COLUMN IF NOT EXISTS "executor" text DEFAULT 'artemis' NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "artemis_tasks_nonce_uidx" ON "artemis_tasks" ("nonce")`;
  await sql`CREATE INDEX IF NOT EXISTS "artemis_tasks_user_id_idx" ON "artemis_tasks" ("user_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "artemis_tasks_mission_id_idx" ON "artemis_tasks" ("mission_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "artemis_tasks_execution_id_idx" ON "artemis_tasks" ("execution_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "artemis_tasks_status_idx" ON "artemis_tasks" ("status")`;
  await sql`CREATE INDEX IF NOT EXISTS "artemis_tasks_device_status_idx" ON "artemis_tasks" ("device_serial", "status")`;
  await sql`CREATE INDEX IF NOT EXISTS "artemis_tasks_executor_status_idx" ON "artemis_tasks" ("executor", "status")`;

  await sql`
    DO $$ BEGIN
      ALTER TABLE "artemis_tasks" ADD CONSTRAINT "artemis_tasks_user_id_users_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `;
  await sql`
    DO $$ BEGIN
      ALTER TABLE "artemis_tasks" ADD CONSTRAINT "artemis_tasks_mission_id_missions_id_fk"
        FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `;
  await sql`
    DO $$ BEGIN
      ALTER TABLE "artemis_tasks" ADD CONSTRAINT "artemis_tasks_execution_id_executions_id_fk"
        FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `;
  await sql`
    DO $$ BEGIN
      ALTER TABLE "artemis_tasks" ADD CONSTRAINT "artemis_tasks_gate_id_write_gates_id_fk"
        FOREIGN KEY ("gate_id") REFERENCES "write_gates"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `;
  ensured = true;
}

export function __resetArtemisEnsureForTests(): void {
  ensured = false;
}
