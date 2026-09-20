-- Script SQL Idempotente para schema de planos, bilhetagem e founder_waitlist
-- Espelha as tabelas usage_counters, founder_waitlist e as colunas em users

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'plan'
    ) THEN
        ALTER TABLE users ADD COLUMN plan text NOT NULL DEFAULT 'free';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'preferred_model'
    ) THEN
        ALTER TABLE users ADD COLUMN preferred_model text;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS usage_counters (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
    day text NOT NULL,
    messages integer NOT NULL DEFAULT 0,
    premium_messages integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_counters_user_day_uidx ON usage_counters(user_id, day);
CREATE INDEX IF NOT EXISTS usage_counters_user_id_idx ON usage_counters(user_id);

CREATE TABLE IF NOT EXISTS founder_waitlist (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    position integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
