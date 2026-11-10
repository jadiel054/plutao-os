-- MCP write scopes require explicit, per-grant user consent.
-- Existing grants deliberately remain read-only; legacy scope strings never imply consent.
ALTER TABLE "mcp_oauth_grants"
  ADD COLUMN IF NOT EXISTS "write_consented_at" timestamp with time zone;

UPDATE "mcp_oauth_grants"
SET "scope" = 'mcp:read'
WHERE "write_consented_at" IS NULL
  AND "scope" LIKE '%mcp:write%';
