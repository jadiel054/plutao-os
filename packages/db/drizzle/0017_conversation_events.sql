-- Migration 0017: conversation event stream (append-only)
-- Aplicar no SQL Editor do Neon (padrão da casa — não migrate automático em prod).

CREATE TABLE IF NOT EXISTS "event_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "char_count" integer NOT NULL,
  "content_type" text NOT NULL DEFAULT 'text/plain',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "event_artifacts_conversation_id_idx"
  ON "event_artifacts" ("conversation_id");

CREATE TABLE IF NOT EXISTS "conversation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "seq" bigint NOT NULL,
  "type" text NOT NULL,
  "source" text NOT NULL DEFAULT 'runtime',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "preview" text NOT NULL DEFAULT '',
  "artifact_id" uuid REFERENCES "event_artifacts"("id") ON DELETE SET NULL,
  "visibility" text NOT NULL DEFAULT 'llm',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "conversation_events_conversation_id_seq_uidx" UNIQUE ("conversation_id", "seq")
);

CREATE INDEX IF NOT EXISTS "conversation_events_conversation_created_idx"
  ON "conversation_events" ("conversation_id", "created_at");

CREATE INDEX IF NOT EXISTS "conversation_events_conversation_seq_idx"
  ON "conversation_events" ("conversation_id", "seq");
