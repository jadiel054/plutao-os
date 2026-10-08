-- 0025_mission_intake
-- Unified chat/Cockpit mission intake metadata. Safe to re-run.
ALTER TABLE "missions"
  ADD COLUMN IF NOT EXISTS "creation_source" text NOT NULL DEFAULT 'cockpit';

ALTER TABLE "missions"
  ADD COLUMN IF NOT EXISTS "conversation_id" uuid;

DO $$
BEGIN
  ALTER TABLE "missions"
    ADD CONSTRAINT "missions_conversation_id_conversations_id_fk"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "missions_conversation_id_idx"
  ON "missions" ("conversation_id");
