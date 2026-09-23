-- Migration 0011: write gates (Princípio 1 — aprovação humana antes de write no mundo real)
-- Aplicar no SQL Editor do Neon (não rodar migrate automático em produção).

CREATE TABLE IF NOT EXISTS "write_gates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "mission_id" uuid REFERENCES "missions"("id") ON DELETE SET NULL,
  "execution_id" uuid,
  "provider" text NOT NULL,
  "capability" text NOT NULL,
  "target" text NOT NULL,
  "summary" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "content_preview" text,
  "status" text NOT NULL DEFAULT 'pending',
  "decision" text,
  "result" jsonb,
  "error" text,
  "decided_at" timestamp with time zone,
  "executed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "write_gates_user_id_idx" ON "write_gates" ("user_id");
CREATE INDEX IF NOT EXISTS "write_gates_mission_id_idx" ON "write_gates" ("mission_id");
CREATE INDEX IF NOT EXISTS "write_gates_status_idx" ON "write_gates" ("status");
CREATE INDEX IF NOT EXISTS "write_gates_user_status_idx" ON "write_gates" ("user_id", "status");
