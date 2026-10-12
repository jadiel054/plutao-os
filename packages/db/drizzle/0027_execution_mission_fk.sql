-- 0027_execution_mission_fk
-- Restore the FK already declared in src/schema.ts. Abort before DDL if mission references are orphaned.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "public"."executions" e
    LEFT JOIN "public"."missions" m ON m."id" = e."mission_id"
    WHERE m."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot apply 0027_execution_mission_fk: executions contains orphan mission_id rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'executions_mission_id_missions_id_fk'
      AND c.conrelid = 'public.executions'::regclass
      AND c.contype = 'f'
      AND (c.confrelid <> 'public.missions'::regclass OR c.confdeltype <> 'c')
  ) THEN
    RAISE EXCEPTION 'Constraint executions_mission_id_missions_id_fk exists with an unexpected definition';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'executions_mission_id_missions_id_fk'
      AND c.conrelid = 'public.executions'::regclass
      AND c.confrelid = 'public.missions'::regclass
      AND c.contype = 'f'
      AND c.confdeltype = 'c'
  ) THEN
    ALTER TABLE "public"."executions"
      ADD CONSTRAINT "executions_mission_id_missions_id_fk"
      FOREIGN KEY ("mission_id")
      REFERENCES "public"."missions"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END $$;
