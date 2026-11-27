-- 0032 — Núcleo agêntico: registro de experiências operacionais.
-- IMPORTANTE: preparada pelo núcleo agêntico; aplicação no Neon é manual
-- (mantenedor + ChatGPT). O código degrada graciosamente sem esta tabela.
CREATE TABLE IF NOT EXISTS "agent_experiences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "subject" text NOT NULL,
  "kind" text NOT NULL,
  "method" text NOT NULL,
  "cause" text,
  "obstacle_kind" text,
  "failed_method" text,
  "alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "useful_for" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "mission_id" uuid,
  "conversation_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_experiences_user_subject_idx" ON "agent_experiences" ("user_id", "subject");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_experiences_user_id_idx" ON "agent_experiences" ("user_id");