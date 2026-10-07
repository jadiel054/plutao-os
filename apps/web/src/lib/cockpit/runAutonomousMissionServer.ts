/**
 * Server-side Autonomia V1.1 cycle.
 * The normal caller is the authenticated durable runtime worker. Direct callers
 * such as gate approval may still resume a known execution explicitly.
 *
 * ## Missões longas (H1)
 * `POST /api/missions/:id/autonomous-run` declara `maxDuration = 300` (5 min).
 * O loop inteiro (`runAgentLoop`, até MAX_ITERATIONS) roda **dentro** desse request.
 * Se o trabalho ultrapassar o teto da plataforma, a execução é cortada no meio
 * (execution pode ficar RUNNING/INTERRUPTED sem complete limpo).
 *
 * O endpoint público de autonomous-run apenas enfileira; esta função não deve
 * ser chamada por ele sem que um worker tenha reivindicado o job.
 */
import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import {
  applyStepTransition,
  getMissionGraphSerialOrder,
  parseMissionPlan,
  type MissionGraphV2,
  type MissionPlanV1,
} from "@plutao/domain";
import { getDb } from "@/lib/db";
import { transitionMissionStatus } from "@/lib/missions/transition";
import { getOwnedMission, parseEvidence } from "@/lib/missions/ownership";
import { verifyDefinitionOfDone } from "@/lib/missions/dod";
import {
  completeExecution,
  findRecoverableExecution,
  getOwnedExecution,
  resumeExecution,
  startExecution,
  writeCheckpoint,
} from "@/lib/runtime/service";
import { MAX_ITERATIONS } from "@/lib/runtime/agent-loop";
import { nextStatuses } from "@/lib/missions/lifecycle";
import { ensurePersistedMissionGraph } from "@/lib/missions/graphPersistence";
import { runNextMissionGraphNodeSerial } from "@/lib/missions/serialMissionExecutor";

export type AutonomousRunResult = {
  ok: boolean;
  missionId: string;
  finalStatus: string;
  allowedTransitions: string[];
  stepsOk: number;
  completed: boolean;
  executionId: string | null;
  stopReason?: string;
  error?: string;
  message?: string;
  dod?: unknown;
  continuation?: boolean;
  waitingApproval?: boolean;
  graphNodeId?: string;
};

const PATH_TO_EXECUTING = ["UNDERSTANDING", "PLANNING", "EXECUTING"] as const;
const ORDER = ["CREATED", "UNDERSTANDING", "PLANNING", "EXECUTING"];

/** Legacy helper retained for callers/tests; graph execution uses node-level transitions. */
export async function ensureFirstPlanStepRunning(
  missionId: string,
  userId: string
): Promise<MissionPlanV1 | null> {
  const mission = await getOwnedMission(missionId, userId);
  if (!mission) return null;
  const plan = parseMissionPlan(mission.plan);
  if (!plan || !plan.aligned || plan.steps.length === 0) return plan;
  const step0 = plan.steps[0];
  if (!step0 || step0.status !== "PENDING") return plan;
  const next = applyStepTransition(plan, step0.id, "RUNNING", {
    eventLabel: `Iniciando: ${step0.title}`,
    eventDetail: "Passo 0 liberado pelo runtime autônomo",
  });
  if (!next) return plan;
  const completedSteps = next.steps.filter((step) => step.status === "PASSED").map((step) => step.title);
  const pendingSteps = next.steps
    .filter((step) => step.status !== "PASSED" && step.status !== "CANCELLED")
    .map((step) => step.title);
  const db = getDb();
  await db
    .update(missions)
    .set({ plan: next, completedSteps, pendingSteps, updatedAt: new Date() })
    .where(and(eq(missions.id, missionId), eq(missions.userId, userId)));
  return next;
}

export async function runAutonomousMissionServer(opts: {
  missionId: string;
  userId: string;
  /** Quando presente, o worker executa exatamente o job reivindicado. */
  executionId?: string | null;
  currentTaskId?: string | null;
  maxIterations?: number;
  missionGraph?: MissionGraphV2;
  /** G3: conversa do chat que originou a missão — events no Computador. */
  conversationId?: string | null;
}): Promise<AutonomousRunResult> {
  const { missionId, userId } = opts;
  const maxIterations = Math.min(
    Math.max(1, opts.maxIterations ?? MAX_ITERATIONS),
    20
  );

  const mission = await getOwnedMission(missionId, userId);
  if (!mission) {
    return {
      ok: false,
      missionId,
      finalStatus: "UNKNOWN",
      allowedTransitions: [],
      stepsOk: 0,
      completed: false,
      executionId: null,
      error: "NOT_FOUND",
      message: "Missão não encontrada",
    };
  }

  let status = String(mission.status).toUpperCase();
  if (["COMPLETED", "CANCELLED", "FAILED", "INCONCLUSIVE"].includes(status)) {
    return {
      ok: false,
      missionId,
      finalStatus: status,
      allowedTransitions: nextStatuses(status),
      stepsOk: 0,
      completed: status === "COMPLETED",
      executionId: null,
      error: "ALREADY_TERMINAL",
      message: "Missão já finalizada",
    };
  }

  if (!process.env.MODEL_API_KEY) {
    return {
      ok: false,
      missionId,
      finalStatus: status,
      allowedTransitions: nextStatuses(status),
      stepsOk: 0,
      completed: false,
      executionId: null,
      error: "MODEL_NOT_CONFIGURED",
      message: "Configure MODEL_API_KEY no Vercel",
    };
  }

  let missionGraph: MissionGraphV2;
  try {
    missionGraph = opts.missionGraph ?? await ensurePersistedMissionGraph(missionId, userId);
  } catch (error) {
    const code = error instanceof Error ? error.message : "MISSION_GRAPH_INVALID";
    return {
      ok: false,
      missionId,
      finalStatus: status,
      allowedTransitions: nextStatuses(status),
      stepsOk: 0,
      completed: false,
      executionId: opts.executionId ?? null,
      error: code,
      message: "O grafo versionado da missão não pôde ser carregado com segurança.",
    };
  }
  if (!getMissionGraphSerialOrder(missionGraph)) {
    return {
      ok: false,
      missionId,
      finalStatus: status,
      allowedTransitions: nextStatuses(status),
      stepsOk: 0,
      completed: false,
      executionId: opts.executionId ?? null,
      error: "MISSION_GRAPH_SERIAL_LIMIT",
      message: "O worker serial aceita até 20 nós por execução nesta etapa.",
    };
  }

  for (const next of PATH_TO_EXECUTING) {
    if (status === "EXECUTING") break;
    if (status === next) continue;
    const i = ORDER.indexOf(status);
    const j = ORDER.indexOf(next);
    if (i < 0 || j <= i) continue;

    const t = await transitionMissionStatus({
      missionId,
      userId,
      toStatus: next,
    });
    if (!t.ok) {
      return {
        ok: false,
        missionId,
        finalStatus: status,
        allowedTransitions: t.allowed ?? nextStatuses(status),
        stepsOk: 0,
        completed: false,
        executionId: null,
        error: t.error,
        message: t.message ?? t.error,
        dod: t.dod,
      };
    }
    status = t.status;
  }

  type ExecutionRow = NonNullable<Awaited<ReturnType<typeof getOwnedExecution>>>;
  let recoverable: ExecutionRow | null = opts.executionId
    ? await getOwnedExecution(opts.executionId, userId)
    : await findRecoverableExecution(missionId, userId);
  if (recoverable?.status === "PENDING") {
    const resumed = await resumeExecution(recoverable.id, userId);
    recoverable = "execution" in resumed ? resumed.execution ?? null : null;
  }
  if (!recoverable) {
    const started = await startExecution({
      missionId,
      userId,
      currentTaskId: opts.currentTaskId ?? null,
    });
    recoverable = started.execution;
  }
  if (recoverable?.status === "PENDING") {
    const resumed = await resumeExecution(recoverable.id, userId);
    recoverable = "execution" in resumed ? resumed.execution ?? null : null;
  }

  const executionId = recoverable?.id ? String(recoverable.id) : null;
  if (!executionId) {
    return {
      ok: false,
      missionId,
      finalStatus: status,
      allowedTransitions: nextStatuses(status),
      stepsOk: 0,
      completed: false,
      executionId: null,
      error: "NO_EXECUTION",
      message: "Não foi possível iniciar execução",
    };
  }

  // G3: amarra conversationId no checkpoint para o dispatcher emitir action/observation
  const conversationId =
    typeof opts.conversationId === "string" && opts.conversationId.trim()
      ? opts.conversationId.trim()
      : null;
  if (conversationId) {
    try {
      await writeCheckpoint(executionId, userId, {
        conversationId,
        note: "G3 conversation bind",
      });
    } catch (e) {
      console.error("[runAutonomousMissionServer conversation bind]", e);
    }
  }

  const graphRun = await runNextMissionGraphNodeSerial({
    missionId,
    userId,
    executionId,
    graph: missionGraph,
    maxIterations,
  });
  const stepsOk = graphRun.iterations;

  if (graphRun.kind === "failed") {
    const failure = graphRun.error || graphRun.stopReason;
    await completeExecution(executionId, userId, "FAILED", failure);

    const failedMission = await transitionMissionStatus({ missionId, userId, toStatus: "FAILED" });
    const failedStatus = failedMission.ok
      ? failedMission.status
      : String((await getOwnedMission(missionId, userId))?.status ?? status);

    return {
      ok: false,
      missionId,
      finalStatus: failedStatus,
      allowedTransitions: nextStatuses(failedStatus),
      stepsOk,
      completed: false,
      executionId,
      stopReason: graphRun.stopReason,
      error: failure,
      message: `Execução falhou: ${failure}`,
    };
  }

  if (graphRun.kind === "continuation") {
    return {
      ok: true,
      missionId,
      finalStatus: status,
      allowedTransitions: nextStatuses(status),
      stepsOk,
      completed: false,
      executionId,
      stopReason: "MISSION_GRAPH_NODE_PASSED",
      continuation: true,
      graphNodeId: graphRun.nodeId,
      message: `Nó ${graphRun.nodeId} verificado; worker liberará o próximo nó em série.`,
    };
  }

  if (graphRun.kind === "waiting_approval") {
    return {
      ok: true,
      missionId,
      finalStatus: status,
      allowedTransitions: nextStatuses(status),
      stepsOk,
      completed: false,
      executionId,
      stopReason: "MISSION_GRAPH_WAITING_APPROVAL",
      waitingApproval: true,
      graphNodeId: graphRun.nodeId,
      message: `Nó ${graphRun.nodeId} aguardando aprovação humana; execução pausada até a decisão.`,
    };
  }

  await completeExecution(executionId, userId, "COMPLETED");

  if (status === "EXECUTING") {
    const t = await transitionMissionStatus({
      missionId,
      userId,
      toStatus: "VERIFYING",
    });
    if (t.ok) {
      status = t.status;
    }
  }

  let completed = false;
  let dodResult: unknown = undefined;
  if (status === "VERIFYING") {
    const full = await getOwnedMission(missionId, userId);
    if (full) {
      const allEvidence = parseEvidence(full.evidence);
      const evidence = allEvidence.filter(
        (item) => item.executionId === executionId
      );
      const dod = verifyDefinitionOfDone({
        objective: String(full.objective ?? ""),
        definitionOfDone: full.definitionOfDone,
        evidence,
      });
      dodResult = dod;
      if (dod.passed) {
        const t = await transitionMissionStatus({
          missionId,
          userId,
          toStatus: "COMPLETED",
        });
        if (t.ok) {
          status = t.status;
          completed = true;
        }
      }
    }
  }

  const final = await getOwnedMission(missionId, userId);
  const finalStatus = final ? String(final.status) : status;

  return {
    ok: stepsOk > 0 || completed || graphRun.kind === "complete",
    missionId,
    finalStatus,
    allowedTransitions: nextStatuses(finalStatus),
    stepsOk,
    completed,
    executionId,
    stopReason: "MISSION_GRAPH_COMPLETE",
    message: completed
      ? `Missão COMPLETED — ${stepsOk} passo(s), DoD OK`
      : stepsOk > 0
        ? `Execução ok (${stepsOk} passo(s)) — status: ${finalStatus}`
        : "Grafo serial concluído; missão aguarda/terminou verificação global",
    dod: dodResult,
    error: undefined,
  };
}
