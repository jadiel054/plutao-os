import { NextRequest, NextResponse } from "next/server";
import { getOwnedTaskInMission } from "@/lib/missions/ownership";
import { runAutonomousMissionServer } from "@/lib/cockpit/runAutonomousMissionServer";
import {
  claimNextRuntimeJob,
  completeRuntimeJob,
  parseRuntimeJobPayload,
  retryRuntimeJob,
} from "@/lib/runtime/durableJobs";
import { recordRuntimeTelemetry } from "@/lib/observability/runtimeTelemetry";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_BATCH = 3;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const startedAt = Date.now();
  const processed: Array<Record<string, unknown>> = [];
  for (let i = 0; i < MAX_BATCH; i += 1) {
    const job = await claimNextRuntimeJob();
    if (!job) break;
    const payload = parseRuntimeJobPayload(job.payload);
    const jobStartedAt = Date.now();
    await recordRuntimeTelemetry({
      userId: job.userId,
      missionId: job.missionId,
      executionId: job.executionId,
      jobId: job.id,
      status: "started",
      attempt: job.attempts,
      metadata: { worker: true },
    });
    try {
      if (payload.currentTaskId && !(await getOwnedTaskInMission(payload.currentTaskId, job.missionId, job.userId))) {
        throw new Error("TASK_NOT_FOUND_IN_MISSION");
      }
      const result = await runAutonomousMissionServer({
        missionId: job.missionId,
        userId: job.userId,
        currentTaskId: payload.currentTaskId ?? null,
        maxIterations: payload.maxIterations,
        conversationId: payload.conversationId ?? null,
      });
      const ok = result.ok === true || result.error === "ALREADY_TERMINAL";
      if (ok) {
        await completeRuntimeJob(job.id, job.lockToken ?? "", true);
        await recordRuntimeTelemetry({
          userId: job.userId,
          missionId: job.missionId,
          executionId: job.executionId,
          jobId: job.id,
          status: "succeeded",
          attempt: job.attempts,
          durationMs: Date.now() - jobStartedAt,
          metadata: { worker: true, result: result.error ?? "ok" },
        });
        processed.push({ id: job.id, status: "SUCCEEDED" });
      } else {
        const reason = result.error ?? "AUTONOMOUS_RUN_FAILED";
        await retryRuntimeJob(job.id, job.lockToken ?? "", reason);
        await recordRuntimeTelemetry({
          userId: job.userId,
          missionId: job.missionId,
          executionId: job.executionId,
          jobId: job.id,
          status: "requeued",
          attempt: job.attempts,
          durationMs: Date.now() - jobStartedAt,
          errorType: reason,
          error: result.message,
          metadata: { worker: true },
        });
        processed.push({ id: job.id, status: "REQUEUED", error: reason });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await retryRuntimeJob(job.id, job.lockToken ?? "", message);
      await recordRuntimeTelemetry({
        userId: job.userId,
        missionId: job.missionId,
        executionId: job.executionId,
        jobId: job.id,
        status: "failed",
        attempt: job.attempts,
        durationMs: Date.now() - jobStartedAt,
        errorType: "WORKER_EXCEPTION",
        error: message,
        metadata: { worker: true },
      });
      processed.push({ id: job.id, status: "REQUEUED", error: "WORKER_EXCEPTION" });
    }
  }
  return NextResponse.json({ ok: true, processed, durationMs: Date.now() - startedAt });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
