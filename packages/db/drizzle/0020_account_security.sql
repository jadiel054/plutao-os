-- Migration 0020: 2FA TOTP e códigos de backup.
-- Aplicar manualmente no Neon. Esta migration não é executada pelo agente.

CREATE TABLE IF NOT EXISTS totp_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  secret_enc text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS totp_secrets_user_id_idx ON totp_secrets (user_id);

CREATE TABLE IF NOT EXISTS backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backup_codes_user_id_idx ON backup_codes (user_id);
