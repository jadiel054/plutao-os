-- 0026_mission_graph_v2
-- Versioned graph definition lives on the mission; mutable per-execution node state stays in executions.checkpoint.
ALTER TABLE "missions"
  ADD COLUMN IF NOT EXISTS "graph_version" integer;

ALTER TABLE "missions"
  ADD COLUMN IF NOT EXISTS "mission_graph" jsonb;
