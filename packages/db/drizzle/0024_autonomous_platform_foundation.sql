-- 0024_autonomous_platform_foundation
-- Durable runtime jobs with lease/retry semantics. Safe to re-run.
CREATE TABLE IF NOT EXISTS runtime_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL UNIQUE REFERENCES executions(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'mission_execution',
  status text NOT NULL DEFAULT 'PENDING',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  lock_token text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS runtime_jobs_status_available_idx ON runtime_jobs(status, available_at);
CREATE INDEX IF NOT EXISTS runtime_jobs_mission_id_idx ON runtime_jobs(mission_id);
CREATE INDEX IF NOT EXISTS runtime_jobs_user_id_idx ON runtime_jobs(user_id);
CREATE INDEX IF NOT EXISTS runtime_jobs_locked_at_idx ON runtime_jobs(locked_at);
