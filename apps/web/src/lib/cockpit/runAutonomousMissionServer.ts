/**
 * Server-side Autonomia V1.1 cycle.
 * Survives client tab close for the duration of the HTTP request (Vercel maxDuration).
 * Does NOT implement Service Worker / closed-PWA workers — that is a later phase.
 */
import { transitionMissionStatus } from "@/lib/missions/transition";
import { getOwnedMission, parseEvidence } from "@/lib/missions/ownership";
import { verifyDefinitionOfDone } from "@/lib/missions/dod";
import {
  completeExecution,
  findRecoverableExecution,
  startExecution,
} from "@/lib/runtime/service";
import { runAgentLoop, MAX_ITERATIONS } from "@/lib/runtime/agent-loop";
import { nextStatuses } from "@/lib/missions/lifecycle";

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
};

const PATH_TO_EXECUTING = ["UNDERSTANDING", "PLANNING", "EXECUTING"] as const;
const ORDER = ["CREATED", "UNDERSTANDING", "PLANNING", "EXECUTING"];

export async function runAutonomousMissionServer(opts: {
  missionId: string;
  userId: string;
  currentTaskId?: string | null;
  maxIterations?: number;
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
  if (["COMPLETED", "CANCELLED", "FAILED"].includes(status)) {
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

  let recoverable = await findRecoverableExecution(missionId, userId);
  if (!recoverable) {
    const started = await startExecution({
      missionId,
      userId,
      currentTaskId: opts.currentTaskId ?? null,
    });
    recoverable = started.execution;
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

  const loop = await runAgentLoop(executionId, userId, maxIterations);
  const stepsOk = loop.iterations ?? 0;

  const loopFailed =
    !loop.ok ||
    loop.stopReason.startsWith("TOOL_ERROR") ||
    loop.stopReason.startsWith("MODEL_STEP_ERROR") ||
    loop.stopReason === "MAX_ITERATIONS_REACHED";

  if (loopFailed) {
    const failure = loop.error ?? loop.stopReason;
    await completeExecution(executionId, userId, "FAILED", failure);

    const failedMission = await transitionMissionStatus({
      missionId,
      userId,
      toStatus: "FAILED",
    });
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
      stopReason: loop.stopReason,
      error: failure,
      message: `Execução falhou: ${failure}`,
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
    ok: stepsOk > 0 || completed || loop.ok,
    missionId,
    finalStatus,
    allowedTransitions: nextStatuses(finalStatus),
    stepsOk,
    completed,
    executionId,
    stopReason: loop.stopReason,
    message: completed
      ? `Missão COMPLETED — ${stepsOk} passo(s), DoD OK`
      : stepsOk > 0
        ? `Execução ok (${stepsOk} passo(s)) — status: ${finalStatus}`
        : loop.error ?? loop.stopReason ?? "Nenhum passo concluído",
    dod: dodResult,
    error: stepsOk === 0 && !completed ? loop.error ?? loop.stopReason : undefined,
  };
}
