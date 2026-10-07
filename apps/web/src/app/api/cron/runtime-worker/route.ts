import { NextRequest, NextResponse } from "next/server";
import { getOwnedConversation, getOwnedMission, getOwnedTaskInMission } from "@/lib/missions/ownership";
import { isMissionStatus, TERMINAL_STATUSES } from "@/lib/missions/lifecycle";
import { runAutonomousMissionServer } from "@/lib/cockpit/runAutonomousMissionServer";
import {
  claimNextRuntimeJob,
  completeRuntimeJob,
  parseRuntimeJobPayload,
  reconcileRuntimeJobStates,
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

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_BATCH = 3;

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
        if (["PENDING", "PAUSED", "INTERRUPTED"].includes(String(execution.status))) {
          const resumed = await resumeExecution(execution.id, job.userId);
          if ("error" in resumed || !resumed.execution) {
            throw new Error(resumed.error ?? "EXECUTION_RESUME_FAILED");
          }
          execution = resumed.execution;
        }

        if (["RUNNING"].includes(String(execution.status))) {
          await runAutonomousMissionServer({
            missionId: job.missionId,
            userId: job.userId,
            executionId: job.executionId,
            currentTaskId: payload.currentTaskId ?? null,
            maxIterations: payload.maxIterations,
            conversationId: payload.conversationId ?? null,
          });
        }
      }

      const finalExecution = await getOwnedExecution(job.executionId, job.userId);
      const outcome = resolveRuntimeJobOutcome(null, finalExecution?.status);

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
      } else {
        const retry = await retryRuntimeJob(job.id, job.lockToken ?? "", outcome.reason);
        const retryStatus = String(retry?.status ?? "PENDING");
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
          metadata: { worker: true, executionStatus: finalExecution?.status ?? null },
        });
        processed.push({
          id: job.id,
          status: retryStatus === "FAILED" ? "FAILED" : "REQUEUED",
          executionStatus: finalExecution?.status,
          error: outcome.reason,
        });
      }
    } catch (error) {
      const message = sanitizeError(error, "WORKER_EXCEPTION");
      const finalExecution = await getOwnedExecution(job.executionId, job.userId).catch(() => null);
      const outcome = resolveRuntimeJobOutcome({ error: message }, finalExecution?.status);
      if (outcome.action === "cancel") {
        await completeRuntimeJob(job.id, job.lockToken ?? "", "CANCELLED", outcome.reason);
      } else if (outcome.action === "succeed") {
        await completeRuntimeJob(job.id, job.lockToken ?? "", "SUCCEEDED");
      } else {
        await retryRuntimeJob(job.id, job.lockToken ?? "", outcome.reason === "EXECUTION_NOT_TERMINAL" ? message : outcome.reason);
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
        status: outcome.action === "cancel" ? "CANCELLED" : "REQUEUED",
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
