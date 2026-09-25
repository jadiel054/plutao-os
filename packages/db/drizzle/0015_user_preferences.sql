-- Migration 0015: user preferences (voice / TTS settings)
-- Apply manually via Neon SQL Editor — do not run drizzle migrate in prod.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;
