import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedMission } from "@/lib/missions/ownership";
import { getOwnedConversation, getOwnedTaskInMission } from "@/lib/missions/ownership";
import { runAutonomousMissionServer } from "@/lib/cockpit/runAutonomousMissionServer";
import { ensureExecutionsTable } from "@/lib/runtime/ensure";
import {
  completeRuntimeJob,
  enqueueMissionExecutionJob,
  leaseRuntimeJob,
  retryRuntimeJob,
} from "@/lib/runtime/durableJobs";
import { createRequestId, recordRuntimeTelemetry } from "@/lib/observability/runtimeTelemetry";

export const runtime = "nodejs";
/** Allow long autonomous cycles on Vercel Pro (Hobby caps lower). */
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — run Autonomia V1.1 fully on the server (Background Execution V1).
 * Client may disconnect; work continues until this request finishes or platform timeout.
 * Not Service Worker / closed-PWA execution — that remains a later phase.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id: missionId } = await ctx.params;
  const mission = await getOwnedMission(missionId, user.id);
  if (!mission) {
    return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
  }

  try {
    await ensureExecutionsTable();
    const requestId = createRequestId(req.headers.get("x-request-id"));
    const body = await req.json().catch(() => ({}));
    const currentTaskId = body.currentTaskId ? String(body.currentTaskId) : null;
    const maxIterations = body.maxIterations ? Number(body.maxIterations) : undefined;
    const conversationId = body.conversationId
      ? String(body.conversationId).trim()
      : null;

    if (currentTaskId && !(await getOwnedTaskInMission(currentTaskId, missionId, user.id))) {
      return NextResponse.json({ error: "Task não encontrada nesta missão" }, { status: 404 });
    }
    if (conversationId && !(await getOwnedConversation(conversationId, user.id))) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    let jobId: string | null = null;
    let jobLockToken: string | null = null;
    try {
      const queued = await enqueueMissionExecutionJob({
        missionId,
        userId: user.id,
        currentTaskId,
        conversationId,
        maxIterations,
      });
      jobId = queued.job.id;
      const leased = await leaseRuntimeJob(jobId);
      jobLockToken = leased?.lockToken ?? null;
    } catch (error) {
      // Compatibilidade durante rollout: a execução direta continua funcionando antes da 0024.
      console.warn("[missions/:id/autonomous-run] durable queue unavailable", error);
    }
    const runStartedAt = Date.now();
    await recordRuntimeTelemetry({
      userId: user.id,
      requestId,
      missionId,
      jobId,
      status: "started",
      metadata: { source: "autonomous-run", durableQueue: Boolean(jobId) },
    });

    const result = await runAutonomousMissionServer({
      missionId,
      userId: user.id,
      currentTaskId,
      maxIterations,
      conversationId,
    });

    if (jobId) {
      const successful = result.ok || result.error === "ALREADY_TERMINAL";
      if (successful) {
        await completeRuntimeJob(jobId, jobLockToken ?? "", true);
      } else {
        await retryRuntimeJob(jobId, jobLockToken ?? "", result.error ?? "AUTONOMOUS_RUN_FAILED");
      }
    }

    await recordRuntimeTelemetry({
      userId: user.id,
      requestId,
      missionId,
      jobId,
      status: result.ok || result.error === "ALREADY_TERMINAL" ? "succeeded" : "failed",
      durationMs: Date.now() - runStartedAt,
      errorType: result.error ?? null,
      error: result.message,
      metadata: { source: "autonomous-run", durableQueue: Boolean(jobId) },
    });

    const status =
      result.error === "NOT_FOUND"
        ? 404
        : result.error === "MODEL_NOT_CONFIGURED"
          ? 503
          : result.error === "ALREADY_TERMINAL"
            ? 409
            : result.ok
              ? 200
              : 400;

    return NextResponse.json(result, { status });
  } catch (e) {
    console.error("[missions/:id/autonomous-run]", e);
    return NextResponse.json(
      {
        ok: false,
        missionId,
        error: "INTERNAL_ERROR",
        message: e instanceof Error ? e.message : "Falha na execução autônoma",
      },
      { status: 500 }
    );
  }
}
