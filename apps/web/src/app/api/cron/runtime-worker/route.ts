import { NextRequest, NextResponse } from "next/server";
import { getOwnedConversation, getOwnedMission, getOwnedTaskInMission } from "@/lib/missions/ownership";
import { isMissionStatus, TERMINAL_STATUSES } from "@/lib/missions/lifecycle";
import { runAutonomousMissionServer } from "@/lib/cockpit/runAutonomousMissionServer";
import {
  claimNextRuntimeJob,
  completeRuntimeJob,
  continueRuntimeJob,
  parseRuntimeJobPayload,
  reconcileRuntimeJobStates,
  releaseResolvedApprovalJobs,
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

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_BATCH = 1;

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

  for (let i = 0; i < MAX_BATCH; i += 1) {
    const job = await claimNextRuntimeJob();
    if (!job) break;

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
            await publishRuntimeWorkerWake("graph_continued", { delaySeconds: 2 });
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
            { delaySeconds: graphContinuation ? 2 : 30 }
          );
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
