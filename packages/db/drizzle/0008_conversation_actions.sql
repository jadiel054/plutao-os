ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "is_pinned" boolean DEFAULT false NOT NULL;
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "share_token" text;
CREATE UNIQUE INDEX IF NOT EXISTS "missions_share_token_uidx" ON "missions" ("share_token");
