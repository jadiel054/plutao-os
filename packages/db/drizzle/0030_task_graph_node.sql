-- 0030: Projeção dos nós do grafo v2 na tabela "tasks" (Cockpit).
-- A execução do grafo v2 vivia apenas no checkpoint da execution; o Cockpit
-- mostrava TASKS = 0 mesmo com evidências e nós PASSED. Esta migration é
-- aditiva e não destrutiva: tasks manuais (graph_node_id NULL) não são
-- tocadas; o índice UNIQUE aceita múltiplas linhas NULL (NULLS DISTINCT).

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "graph_node_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "tasks_mission_graph_node_uidx"
  ON "tasks" ("mission_id", "graph_node_id");
