import { and, eq } from "drizzle-orm";
import { tasks } from "@plutao/db";
import type { MissionGraphNodeV2 } from "@plutao/domain";
import { getDb } from "@/lib/db";

/**
 * Projeção Cockpit: cada nó do grafo v2 tem uma task correspondente.
 * A execução real continua no checkpoint da execution (fonte única de estado);
 * a task é apenas PROJEÇÃO de leitura — nunca autoridade de decisão.
 *
 * A materialização é best-effort e idempotente por (missionId, graphNodeId):
 * falha em registrar a projeção nunca falha a execução da missão.
 */

export type GraphTaskNodeInput = Pick<MissionGraphNodeV2, "id" | "title" | "description">;

export async function ensureGraphNodeTasks(
  missionId: string,
  graphNodes: GraphTaskNodeInput[]
): Promise<boolean> {
  const db = getDb();
  const existing = await db
    .select({ graphNodeId: tasks.graphNodeId })
    .from(tasks)
    .where(eq(tasks.missionId, missionId))
    .limit(200);
  const present = new Set(
    existing
      .map((row) => row.graphNodeId)
      .filter((id): id is string => typeof id === "string")
  );
  if (graphNodes.every((node) => present.has(node.id))) return true;
  for (const node of graphNodes) {
    if (present.has(node.id)) continue;
    await db
      .insert(tasks)
      .values({
        missionId,
        graphNodeId: node.id,
        title: node.title,
        description: node.description ?? null,
        status: "CREATED",
      })
      .onConflictDoNothing();
  }
  return true;
}

async function ensureGraphNodeTaskRow(
  missionId: string,
  node: GraphTaskNodeInput
): Promise<void> {
  const db = getDb();
  await db
    .insert(tasks)
    .values({
      missionId,
      graphNodeId: node.id,
      title: node.title,
      description: node.description ?? null,
      status: "CREATED",
    })
    .onConflictDoNothing();
}

/**
 * Sincroniza a task projetada do nó com um evento do scheduler serial:
 * "RUNNING" (nó iniciado/retomado) ou "PASSED" (nó verificado pelo DoD).
 * Idempotente; transições inválidas de task manual não são sobrescritas
 * (a task de nó tem graphThreadId próprio e tasks manuais têm graphNodeId NULL).
 */
export async function syncGraphNodeTask(
  missionId: string,
  node: GraphTaskNodeInput,
  target: "RUNNING" | "PASSED"
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: tasks.id, status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.missionId, missionId), eq(tasks.graphNodeId, node.id)))
    .limit(1);

  const now = new Date();
  const targetStatus = target === "PASSED" ? "COMPLETED" : "RUNNING";

  if (!rows[0]) {
    await ensureGraphNodeTaskRow(missionId, node);
    await db
      .update(tasks)
      .set(
        target === "PASSED"
          ? { status: targetStatus, updatedAt: now, completedAt: now }
          : { status: targetStatus, updatedAt: now, startedAt: now }
      )
      .where(and(eq(tasks.missionId, missionId), eq(tasks.graphNodeId, node.id)));
    return true;
  }

  const current = String(rows[0].status).toUpperCase();
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(current)) return true;
  if (current === targetStatus) return true;

  await db
    .update(tasks)
    .set(
      target === "PASSED"
        ? { status: targetStatus, updatedAt: now, completedAt: now }
        : { status: targetStatus, updatedAt: now, startedAt: now }
    )
    .where(and(eq(tasks.missionId, missionId), eq(tasks.graphNodeId, node.id)));
  return true;
}

/** Best-effort: nunca propaga falha de projeção para a execução da missão. */
export function logProjectionError(scope: string, error: unknown): void {
  console.error(`[graphTasks ${scope}]`, error);
}
