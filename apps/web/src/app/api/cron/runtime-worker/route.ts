import { NextRequest, NextResponse } from "next/server";
import { getOwnedConversation, getOwnedMission, getOwnedTaskInMission } from "@/lib/missions/ownership";
import { isMissionStatus, TERMINAL_STATUSES } from "@/lib/missions/lifecycle";
import { runAutonomousMissionServer } from "@/lib/cockpit/runAutonomousMissionServer";
import {
  RUNTIME_JOB_CONTINUATION_DELAY_MS,
  claimNextRuntimeJob,
  completeRuntimeJob,
  continueRuntimeJob,
  parseRuntimeJobPayload,
  reconcileRuntimeJobStates,
  releaseResolvedApprovalJobs,
  renewRuntimeJobLease,
  waitRuntimeJobForApproval,
  resolveRuntimeJobOutcome,
  retryRuntimeJob,
} from "@/lib/runtime/durableJobs";
import {
  completeExecution,
  getOwnedExecution,
  resumeExecution,
} from "@/lib/runtime/service";
import { createRequestId, recordRuntimeTelemetry } from "@/lib/observability/runtimeTelemetry";
import { sanitizeError } from "@/lib/security/sanitize";
import { getMissionGraphSerialOrder } from "@plutao/domain";
import { ensurePersistedMissionGraph } from "@/lib/missions/graphPersistence";
import { publishRuntimeWorkerWake } from "@/lib/runtime/workerQueue";
import { CHAT_BUILD_JOB_KIND, parseChatBuildJobPayload, updateChatBuildJobState } from "@/lib/chat/buildJobs";
import { runChatBuildFlow } from "@/lib/chat/buildRunner";
import { emitObservation } from "@/lib/events/appendConversationEvent";
import { getModelConfig } from "@/lib/runtime/model/config";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_JOBS_PER_INVOCATION = 8;
const WORKER_TIME_BUDGET_MS = 260_000; // maxDuration = 300s com ~40s de margem

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

async function recordReconciliation(repaired: Array<{ jobId: string; executionId: string; from: string; to: string }>) {
  for (const item of repaired) {
    console.warn("[runtime-worker] state divergence reconciled", item);
    await recordRuntimeTelemetry({
      type: "runtime.reconciliation",
      jobId: item.jobId,
      executionId: item.executionId,
      status: "reconciled",
      errorType: "JOB_EXECUTION_STATE_DIVERGENCE",
      error: `${item.from}->${item.to}`,
      metadata: { worker: true, from: item.from, to: item.to },
    });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const startedAt = Date.now();
  const processed: Array<Record<string, unknown>> = [];

  const repaired = await reconcileRuntimeJobStates();
  await recordReconciliation(repaired);
  await releaseResolvedApprovalJobs();

  let processedJobs = 0;
  let drainContinuation = false;

  while (processedJobs < MAX_JOBS_PER_INVOCATION) {
    // Orçamento de tempo: mantém ~40s de margem sobre maxDuration (300s).
    if (Date.now() - startedAt >= WORKER_TIME_BUDGET_MS) break;
    if (drainContinuation) {
      // Respeita o delay de continuação para que o claim (available_at <= now)
      // encontre o job re-enfileirado na mesma invocation.
      await new Promise((resolve) => setTimeout(resolve, RUNTIME_JOB_CONTINUATION_DELAY_MS + 100));
    }
    drainContinuation = false;

    const job = await claimNextRuntimeJob();
    if (!job) break;

    processedJobs += 1;

    const payload = parseRuntimeJobPayload(job.payload);
    const requestId = createRequestId(payload.requestId);
    const jobStartedAt = Date.now();
    await recordRuntimeTelemetry({
      userId: job.userId,
      requestId,
      missionId: job.missionId,
      executionId: job.executionId,
      jobId: job.id,
      status: "started",
      attempt: job.attempts,
      metadata: { worker: true, jobStatus: "RUNNING" },
    });

    try {
      // Execução durável da CRIAÇÃO NO CHAT (kind "chat_build"): não existe
      // missão nem execution do Cockpit neste caminho. O estado do build é
      // checkpoint no payload do job; "continuing" re-enfileira com retomada
      // automática; conclusão exige status terminal do fluxo de criação.
      if (job.kind === CHAT_BUILD_JOB_KIND) {
        const cbPayload = parseChatBuildJobPayload(job.payload);
        if (!cbPayload) throw new Error("CHAT_BUILD_JOB_PAYLOAD_INVALID");
        if (!(await getOwnedConversation(cbPayload.conversationId, job.userId))) {
          throw new Error("CONVERSATION_NOT_FOUND");
        }
        const buildModelConfig = getModelConfig();
        if (!buildModelConfig) throw new Error("MODEL_NOT_CONFIGURED");
        const buildBudgetMs = Math.max(30_000, WORKER_TIME_BUDGET_MS - (Date.now() - startedAt) - 20_000);
        const run = await runChatBuildFlow({
          userId: job.userId,
          conversationId: cbPayload.conversationId,
          userText: cbPayload.userText,
          history: [],
          modelConfig: buildModelConfig,
          initialState: cbPayload.buildState,
          budgetMs: buildBudgetMs,
          maxIterations: 12,
          onHeartbeat: async () => {
            const renewed = await renewRuntimeJobLease(job.id, job.lockToken ?? "");
            return Boolean(renewed);
          },
        });

        if (!run.executed) {
          if (run.reason === "build_already_running") {
            // Lock por conversa segurado por outra instância: volta para a fila.
            const requeued = await continueRuntimeJob(job.id, job.lockToken ?? "");
            if (requeued?.status === "PENDING") {
              await publishRuntimeWorkerWake("graph_continued", { delaySeconds: 0 });
              drainContinuation = true;
            }
            processed.push({ id: job.id, status: requeued?.status ?? "PENDING", kind: "chat_build", note: "build_already_running" });
            continue;
          }
          throw new Error("CHAT_BUILD_MODEL_FAILED");
        }

        if (run.status === "continuing" && run.continuationState) {
          await updateChatBuildJobState(job.id, { ...cbPayload, buildState: run.continuationState });
          const continued = await continueRuntimeJob(job.id, job.lockToken ?? "");
          if (continued?.status === "PENDING") {
            await publishRuntimeWorkerWake("graph_continued", { delaySeconds: 0 });
            drainContinuation = true;
          }
          try {
            await emitObservation({
              conversationId: cbPayload.conversationId,
              tool: "chat_build",
              ok: true,
              outputOrError:
                "Criação em andamento (execução durável): " + run.iterations + " etapa(s) acumulada(s), " +
                (run.artifactsPersisted ?? 0) + " arquivo(s) entregue(s) como artifacts. A execução continua automaticamente.",
              source: "chat_build",
            });
          } catch {
            /* eventos são best-effort */
          }
          processed.push({ id: job.id, status: continued?.status ?? "PENDING", kind: "chat_build", note: "continuing" });
          continue;
        }

        // completed | paused_for_human → job encerrado (SUCCEEDED). A pausa por
        // controle humano é reportada nos eventos da conversa; uma retomada
        // nova passa por nova mensagem/plano na conversa.
        const buildCompleted = await completeRuntimeJob(job.id, job.lockToken ?? "", "SUCCEEDED");
        await recordRuntimeTelemetry({
          userId: job.userId,
          requestId,
          missionId: null,
          executionId: null,
          jobId: job.id,
          status: "succeeded",
          attempt: job.attempts,
          durationMs: Date.now() - jobStartedAt,
          metadata: { worker: true, kind: "chat_build", buildStatus: run.status ?? "completed", artifactsPersisted: run.artifactsPersisted ?? 0 },
        });
        processed.push({ id: job.id, status: buildCompleted?.status ?? "SUCCEEDED", kind: "chat_build", note: run.status ?? "completed" });
        continue;
      }

      let graphContinuation = false;
      let waitingApproval = false;
      if (payload.currentTaskId && !(await getOwnedTaskInMission(payload.currentTaskId, job.missionId, job.userId))) {
        throw new Error("TASK_NOT_FOUND_IN_MISSION");
      }
      if (payload.conversationId && !(await getOwnedConversation(payload.conversationId, job.userId))) {
        throw new Error("CONVERSATION_NOT_FOUND");
      }

      let execution = await getOwnedExecution(job.executionId, job.userId);
      if (!execution) throw new Error("EXECUTION_NOT_FOUND");

      const mission = await getOwnedMission(job.missionId, job.userId);
      if (!mission) throw new Error("MISSION_NOT_FOUND");

      // Uma missão cancelada/terminal não deve reanimar uma execution PENDING.
      const missionStatus = String(mission.status).toUpperCase();
      if (isMissionStatus(missionStatus) && TERMINAL_STATUSES.has(missionStatus)) {
        if (!["COMPLETED", "FAILED", "CANCELLED"].includes(String(execution.status))) {
          const cancelled = await completeExecution(
            execution.id,
            job.userId,
            "CANCELLED",
            "MISSION_ALREADY_TERMINAL"
          );
          execution = cancelled.execution ?? execution;
        }
      } else {
        const missionGraph = await ensurePersistedMissionGraph(job.missionId, job.userId);
        if (!getMissionGraphSerialOrder(missionGraph)) {
          throw new Error("MISSION_GRAPH_SERIAL_LIMIT");
        }
        if (["PENDING", "PAUSED", "INTERRUPTED"].includes(String(execution.status))) {
          const resumed = await resumeExecution(execution.id, job.userId);
          if ("error" in resumed || !resumed.execution) {
            throw new Error(resumed.error ?? "EXECUTION_RESUME_FAILED");
          }
          execution = resumed.execution;
        }

        if (["RUNNING"].includes(String(execution.status))) {
          const runResult = await runAutonomousMissionServer({
            missionId: job.missionId,
            userId: job.userId,
            executionId: job.executionId,
            currentTaskId: payload.currentTaskId ?? null,
            maxIterations: payload.maxIterations,
            missionGraph,
            conversationId: payload.conversationId ?? null,
            heartbeat: async () => {
              const renewed = await renewRuntimeJobLease(job.id, job.lockToken ?? "");
              return Boolean(renewed);
            },
          });
          graphContinuation = runResult.continuation === true;
          waitingApproval = runResult.waitingApproval === true;
        }
      }

      const finalExecution = await getOwnedExecution(job.executionId, job.userId);
      const finalMission = await getOwnedMission(job.missionId, job.userId);

      if (waitingApproval) {
        const waiting = await waitRuntimeJobForApproval(job.id, job.lockToken ?? "");
        if (!waiting) {
          const continued = await continueRuntimeJob(job.id, job.lockToken ?? "");
          if (continued?.status === "PENDING") {
            await publishRuntimeWorkerWake("graph_continued", { delaySeconds: 0 });
            drainContinuation = true;
          }
          processed.push({ id: job.id, status: continued?.status ?? "PENDING", executionStatus: finalExecution?.status });
          continue;
        }
        processed.push({ id: job.id, status: waiting.status, executionStatus: finalExecution?.status });
        await recordRuntimeTelemetry({
          userId: job.userId,
          requestId,
          missionId: job.missionId,
          executionId: job.executionId,
          jobId: job.id,
          status: "queued",
          attempt: job.attempts,
          durationMs: Date.now() - jobStartedAt,
          errorType: "WAITING_APPROVAL",
          metadata: { worker: true, executionStatus: finalExecution?.status ?? null, missionStatus: finalMission?.status ?? null },
        });
        // A-05: segue para o próximo job do lote em vez de abortar o dreno.
        // O job atual já está em WAITING_APPROVAL e não será reclamado até a
        // liberação do gate, portanto continuar não causa reexecução.
        continue;
      }

      const outcome = resolveRuntimeJobOutcome(null, finalExecution?.status, finalMission?.status);

      if (outcome.action === "succeed") {
        const completed = await completeRuntimeJob(job.id, job.lockToken ?? "", "SUCCEEDED");
        const processedStatus = completed?.status ?? "SUCCEEDED";
        await recordRuntimeTelemetry({
          userId: job.userId,
          requestId,
          missionId: job.missionId,
          executionId: job.executionId,
          jobId: job.id,
          status: "succeeded",
          attempt: job.attempts,
          durationMs: Date.now() - jobStartedAt,
          metadata: { worker: true, executionStatus: finalExecution?.status ?? null },
        });
        processed.push({ id: job.id, status: processedStatus, executionStatus: finalExecution?.status });
      } else if (outcome.action === "cancel") {
        const cancelled = await completeRuntimeJob(job.id, job.lockToken ?? "", "CANCELLED", outcome.reason);
        processed.push({ id: job.id, status: cancelled?.status ?? "CANCELLED", executionStatus: finalExecution?.status });
        await recordRuntimeTelemetry({
          userId: job.userId,
          requestId,
          missionId: job.missionId,
          executionId: job.executionId,
          jobId: job.id,
          status: "cancelled",
          attempt: job.attempts,
          durationMs: Date.now() - jobStartedAt,
          errorType: outcome.reason,
          metadata: { worker: true, executionStatus: finalExecution?.status ?? null },
        });
      } else if (outcome.action === "fail") {
        const failed = await completeRuntimeJob(job.id, job.lockToken ?? "", "FAILED", outcome.reason);
        processed.push({ id: job.id, status: failed?.status ?? "FAILED", executionStatus: finalExecution?.status });
        await recordRuntimeTelemetry({
          userId: job.userId,
          requestId,
          missionId: job.missionId,
          executionId: job.executionId,
          jobId: job.id,
          status: "failed",
          attempt: job.attempts,
          durationMs: Date.now() - jobStartedAt,
          errorType: outcome.reason,
          metadata: { worker: true, executionStatus: finalExecution?.status ?? null, missionStatus: finalMission?.status ?? null },
        });
      } else {
        const retry = graphContinuation
          ? await continueRuntimeJob(job.id, job.lockToken ?? "")
          : await retryRuntimeJob(job.id, job.lockToken ?? "", outcome.reason);
        const retryStatus = String(retry?.status ?? "PENDING");
        if (retry?.status === "PENDING") {
          await publishRuntimeWorkerWake(
            graphContinuation ? "graph_continued" : "job_retry",
            { delaySeconds: graphContinuation ? 0 : 30 }
          );
        }
        if (graphContinuation && retry?.status === "PENDING") {
          drainContinuation = true;
        }
        await recordRuntimeTelemetry({
          userId: job.userId,
          requestId,
          missionId: job.missionId,
          executionId: job.executionId,
          jobId: job.id,
          status: retryStatus === "FAILED" ? "failed" : "requeued",
          attempt: job.attempts,
          durationMs: Date.now() - jobStartedAt,
          errorType: outcome.reason,
          error: outcome.reason,
          metadata: { worker: true, executionStatus: finalExecution?.status ?? null, graphContinuation },
        });
        processed.push({
          id: job.id,
          status: retryStatus === "FAILED" ? "FAILED" : graphContinuation ? "CONTINUED" : "REQUEUED",
          executionStatus: finalExecution?.status,
          error: outcome.reason,
        });
      }
    } catch (error) {
      const message = sanitizeError(error, "WORKER_EXCEPTION");
      const finalExecution = await getOwnedExecution(job.executionId, job.userId).catch(() => null);
      const finalMission = await getOwnedMission(job.missionId, job.userId).catch(() => null);
      const outcome = resolveRuntimeJobOutcome({ error: message }, finalExecution?.status, finalMission?.status);
      if (outcome.action === "cancel") {
        await completeRuntimeJob(job.id, job.lockToken ?? "", "CANCELLED", outcome.reason);
      } else if (outcome.action === "fail") {
        await completeRuntimeJob(job.id, job.lockToken ?? "", "FAILED", outcome.reason);
      } else if (outcome.action === "succeed") {
        await completeRuntimeJob(job.id, job.lockToken ?? "", "SUCCEEDED");
      } else {
        const retry = await retryRuntimeJob(
          job.id,
          job.lockToken ?? "",
          outcome.reason === "EXECUTION_NOT_TERMINAL" ? message : outcome.reason
        );
        if (retry?.status === "PENDING") {
          await publishRuntimeWorkerWake("job_retry", { delaySeconds: 30 });
        }
      }
      await recordRuntimeTelemetry({
        userId: job.userId,
        requestId,
        missionId: job.missionId,
        executionId: job.executionId,
        jobId: job.id,
        status: outcome.action === "cancel" ? "cancelled" : "failed",
        attempt: job.attempts,
        durationMs: Date.now() - jobStartedAt,
        errorType: outcome.reason,
        error: message,
        metadata: { worker: true, executionStatus: finalExecution?.status ?? null },
      });
      processed.push({
        id: job.id,
        status:
          outcome.action === "cancel"
            ? "CANCELLED"
            : outcome.action === "fail"
              ? "FAILED"
              : outcome.action === "succeed"
                ? "SUCCEEDED"
                : "REQUEUED",
        error: "WORKER_EXCEPTION",
      });
    }
  }
  return NextResponse.json({
    ok: true,
    reconciled: repaired.length,
    processed,
    durationMs: Date.now() - startedAt,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
