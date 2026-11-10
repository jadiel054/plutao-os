import { neon } from "@neondatabase/serverless";

let ensured = false;

/**
 * A-03: DDL em runtime é um mecanismo de bootstrap legado. Em produção, o
 * esquema deve vir exclusivamente de migrations versionadas (packages/db/drizzle).
 * O bootstrap permanece ativo fora de produção (dev local sem migrate) ou
 * quando RUNTIME_DDL_BOOTSTRAP=true for definido explicitamente.
 */
export function isRuntimeDdlEnabled(): boolean {
  const flag = process.env.RUNTIME_DDL_BOOTSTRAP;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.VERCEL_ENV !== "production";
}

/**
 * Idempotent DDL so dev environments work before the operator runs drizzle
 * migrate. CREATE IF NOT EXISTS only — never drops. Disabled by default in
 * production (see isRuntimeDdlEnabled).
 */
export async function ensureExecutionsTable(): Promise<void> {
  if (ensured) return;
  if (!isRuntimeDdlEnabled()) {
    // Esquema gerenciado por migrations; nada a criar em runtime.
    ensured = true;
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);
  await sql`
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
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS "executions_mission_id_idx" ON "executions" ("mission_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "executions_user_id_idx" ON "executions" ("user_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "executions_status_idx" ON "executions" ("status")`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "executions_idempotency_key_uidx" ON "executions" ("idempotency_key")`;
  ensured = true;
}

/** Test helper: reseta o cache do bootstrap. */
export function resetRuntimeDdlForTests(): void {
  ensured = false;
}
