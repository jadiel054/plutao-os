-- 0033 — Núcleo agêntico: snapshots do inventário de capacidades.
-- IMPORTANTE: preparada pelo núcleo agêntico; aplicação no Neon é manual
-- (mantenedor). Aditiva e idempotente; o código degrada graciosamente sem
-- esta tabela (snapshots indisponíveis, inventário segue em memória).
CREATE TABLE IF NOT EXISTS "agentic_capability_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "inventory" jsonb NOT NULL,
  "diff_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agentic_capability_snapshots_user_created_idx" ON "agentic_capability_snapshots" ("user_id", "created_at");
