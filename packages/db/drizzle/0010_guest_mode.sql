-- Migration 0010: Guest Mode
-- Adds is_guest flag to users and guest_sessions table for persistent server-side guest limits.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_guest" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "guest_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" text NOT NULL UNIQUE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "ip" text,
  "user_agent" text,
  "message_count" integer DEFAULT 0 NOT NULL,
  "first_message_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "converted_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "guest_sessions_token_uidx" ON "guest_sessions" ("token");
CREATE INDEX IF NOT EXISTS "guest_sessions_user_id_idx" ON "guest_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "guest_sessions_ip_idx" ON "guest_sessions" ("ip");
CREATE INDEX IF NOT EXISTS "guest_sessions_created_at_idx" ON "guest_sessions" ("created_at");
