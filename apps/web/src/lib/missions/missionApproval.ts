/**
 * Aprovação única em lote por missão.
 *
 * Em vez de pausar o agente a cada escrita (cascata de aprovação), a missão
 * recebe UM gate em lote no início da execução. Aprovado esse gate, todo o
 * restante executa sem interrupções: o guard consulta o grant gravado na
 * própria tabela write_gates (gate 'executed') e auto-aprova as escritas
 * subsequentes não destrutivas, mantendo auditoria gate a gate. Capacidades
 * destrutivas continuam exigindo gate individual, sempre.
 */

import { and, desc, eq } from "drizzle-orm";
import { createDb, writeGates, type WriteGateRow } from "@plutao/db";
import { createWriteGate } from "@/lib/connectors/gates";

export const MISSION_BATCH_PROVIDER = "plutao";
export const MISSION_BATCH_CAPABILITY = "mission.batch_approval";

/** O plano aprovado vale por 24h; depois a missão volta a pedir autorização. */
const BATCH_GATE_TTL_MS = 24 * 60 * 60 * 1000;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function findMissionBatchGates(
  missionId: string,
  userId: string
): Promise<WriteGateRow[]> {
  const db = createDb();
  return db
    .select()
    .from(writeGates)
    .where(
      and(
        eq(writeGates.missionId, missionId),
        eq(writeGates.userId, userId),
        eq(writeGates.capability, MISSION_BATCH_CAPABILITY)
      )
    )
    .orderBy(desc(writeGates.createdAt))
    .limit(5);
}

/** Indica se a missão já possui autorização única humana aprovada. */
export async function hasMissionBatchGrant(
  missionId: string,
  userId: string
): Promise<boolean> {
  try {
    const gates = await findMissionBatchGates(missionId, userId);
    return gates.some((gate) => gate.status === "executed");
  } catch (error) {
    console.error("[hasMissionBatchGrant]", { missionId, error: errorText(error) });
    return false;
  }
}

/**
 * Uma única autorização humana por missão. Cria o gate em lote de forma
 * idempotente. Retorna o gate pendente quando a missão precisa de aprovação;
 * retorna null quando a autorização já foi concedida ou não se aplica.
 */
export async function ensureMissionBatchApprovalGate(
  missionId: string,
  userId: string,
  opts: { executionId?: string | null; objective: string; nodeTitles: string[] }
): Promise<WriteGateRow | null> {
  try {
    const existing = await findMissionBatchGates(missionId, userId);
    if (existing.some((gate) => gate.status === "executed")) return null;
    const active = existing.find((gate) =>
      ["pending", "approved", "executing"].includes(String(gate.status))
    );
    if (active) return active;

    const etapas = Math.max(1, opts.nodeTitles.length);
    const summary =
      'Autorização única para executar a missão inteira (' +
      etapas +
      ' etapa(s)). Ao aprovar, TODAS as escritas não destrutivas desta missão ' +
      '(arquivos, commits, PRs e exportações) são liberadas sem novas pausas.';
    return await createWriteGate({
      userId,
      missionId,
      executionId: opts.executionId ?? null,
      provider: MISSION_BATCH_PROVIDER,
      capability: MISSION_BATCH_CAPABILITY,
      target: missionId,
      summary,
      payload: { objective: opts.objective, nodeTitles: opts.nodeTitles },
      ttlMs: BATCH_GATE_TTL_MS,
    });
  } catch (error) {
    // Fail-open controlado: sem gate em lote, a missão volta ao comportamento
    // anterior (gate por escrita) em vez de ficar bloqueada.
    console.error("[ensureMissionBatchApprovalGate]", { missionId, error: errorText(error) });
    return null;
  }
}
