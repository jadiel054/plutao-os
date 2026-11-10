-- 0029: Restaura as FKs de "executions" ausentes quando a tabela nasceu via
-- ensureExecutionsTable() (DDL de runtime, sem constraints).
-- Estratégia segura: ADD CONSTRAINT ... NOT VALID + VALIDATE CONSTRAINT.
-- NOT VALID não bloqueia escritas nem valida dados existentes; VALIDATE roda
-- com lock fraco (SHARE UPDATE EXCLUSIVE) e falha -- sem alterar dados -- se
-- houver órfãos, o que torna a migration não destrutiva e re-executável.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'executions_mission_id_missions_id_fk'
      AND conrelid = 'public."executions"'::regclass
  ) THEN
    ALTER TABLE "executions"
      ADD CONSTRAINT "executions_mission_id_missions_id_fk"
      FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id")
      ON DELETE cascade ON UPDATE no action NOT VALID;
    ALTER TABLE "executions"
      VALIDATE CONSTRAINT "executions_mission_id_missions_id_fk";
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'executions_user_id_users_id_fk'
      AND conrelid = 'public."executions"'::regclass
  ) THEN
    ALTER TABLE "executions"
      ADD CONSTRAINT "executions_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action NOT VALID;
    ALTER TABLE "executions"
      VALIDATE CONSTRAINT "executions_user_id_users_id_fk";
  END IF;
END $$;
