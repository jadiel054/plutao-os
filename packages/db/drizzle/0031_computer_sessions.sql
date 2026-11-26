-- Migration 0031: computer_sessions — control plane durável do Computador do Plutão
-- Origem: docs/DB_PROPOSTA_COMPUTER_SESSIONS.md (PR #204), auditada em 2º nível em 26/11/2026.
-- Aplicar no SQL Editor do Neon (padrão da casa — não migrate automático em prod),
-- POR UM AGENTE/OPERADOR AUTORIZADO. A aplicação é idempotente (IF NOT EXISTS).
-- Rollback: DROP TABLE IF EXISTS computer_sessions; (nenhum dado sensível; apenas metadados de sessão).

CREATE TABLE IF NOT EXISTS "computer_sessions" (
  "id" text PRIMARY KEY,
  "conversation_id" text NOT NULL,
  "user_id" text NOT NULL,
  "status" text NOT NULL,
  "controller" text NOT NULL DEFAULT 'agent',
  "controller_changed_at" timestamptz,
  "human_action_until" timestamptz,
  "human_action_token" text,
  "provider" text NOT NULL,
  "lease_expires_at" timestamptz NOT NULL,
  "last_seen_at" timestamptz NOT NULL,
  "units_used" integer NOT NULL DEFAULT 0,
  "channel_instance" text,
  "channel_expires_at" timestamptz,
  "billing_month" text NOT NULL,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "closed_at" timestamptz
);

-- GATE DA SESSÃO ÚNICA: índice único PARCIAL por expressão CONSTANTE em cima
-- de "linha viva" — no máximo UMA linha viva por instalação, INDEPENDENTE do
-- status. INSERT da 2ª linha viva quebra com 23505; linhas fechadas
-- (closed_at NOT NULL) não participam do índice.
CREATE UNIQUE INDEX IF NOT EXISTS "computer_sessions_single_live_uidx"
  ON "computer_sessions" ((1))
  WHERE "closed_at" IS NULL;

CREATE INDEX IF NOT EXISTS "computer_sessions_user_conversation_idx"
  ON "computer_sessions" ("user_id", "conversation_id");
CREATE INDEX IF NOT EXISTS "computer_sessions_lease_idx"
  ON "computer_sessions" ("lease_expires_at");
CREATE INDEX IF NOT EXISTS "computer_sessions_billing_month_idx"
  ON "computer_sessions" ("billing_month");
