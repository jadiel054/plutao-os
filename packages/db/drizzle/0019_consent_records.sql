-- Migration 0019: consentimentos granulares por finalidade.
-- Aplicar manualmente no Neon. Esta migration não é executada pelo agente.

CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  policy_version text NOT NULL,
  granted boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_records_user_scope_idx
  ON consent_records (user_id, scope);
CREATE INDEX IF NOT EXISTS consent_records_user_id_idx
  ON consent_records (user_id);
