-- Migration 0004: connectors (MCP / OAuth) — GitHub first
-- Tokens stored encrypted (app-layer AES). Safe / idempotent.

CREATE TABLE IF NOT EXISTS "connectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "status" text NOT NULL DEFAULT 'disconnected',
  "server_url" text,
  "account_login" text,
  "account_label" text,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "capabilities" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "access_token_enc" text,
  "refresh_token_enc" text,
  "token_expires_at" timestamp with time zone,
  "oauth_state" text,
  "last_error" text,
  "connected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "connectors_user_provider_uidx"
  ON "connectors" ("user_id", "provider");

CREATE INDEX IF NOT EXISTS "connectors_user_id_idx" ON "connectors" ("user_id");
CREATE INDEX IF NOT EXISTS "connectors_status_idx" ON "connectors" ("status");
