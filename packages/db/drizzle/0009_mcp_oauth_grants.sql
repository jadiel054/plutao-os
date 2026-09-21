-- Migration 0009: MCP OAuth grants + single-use auth codes
-- Enables revocation, refresh tokens, and true one-time authorization codes.

CREATE TABLE IF NOT EXISTS "mcp_oauth_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "client_id" text NOT NULL,
  "redirect_uri" text NOT NULL,
  "scope" text NOT NULL DEFAULT 'mcp:read',
  "refresh_token_hash" text,
  "refresh_expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mcp_oauth_grants_user_id_idx"
  ON "mcp_oauth_grants" ("user_id");
CREATE INDEX IF NOT EXISTS "mcp_oauth_grants_client_id_idx"
  ON "mcp_oauth_grants" ("client_id");
CREATE INDEX IF NOT EXISTS "mcp_oauth_grants_refresh_hash_idx"
  ON "mcp_oauth_grants" ("refresh_token_hash")
  WHERE "refresh_token_hash" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "mcp_auth_codes" (
  "jti" text PRIMARY KEY NOT NULL,
  "grant_id" uuid NOT NULL REFERENCES "mcp_oauth_grants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "client_id" text NOT NULL,
  "redirect_uri" text NOT NULL,
  "scope" text NOT NULL DEFAULT 'mcp:read',
  "code_challenge" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mcp_auth_codes_grant_id_idx"
  ON "mcp_auth_codes" ("grant_id");
CREATE INDEX IF NOT EXISTS "mcp_auth_codes_expires_at_idx"
  ON "mcp_auth_codes" ("expires_at");
