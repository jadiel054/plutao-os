import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedConversation, getOwnedMission, getOwnedTaskInMission } from "@/lib/missions/ownership";
import { isMissionStatus, TERMINAL_STATUSES } from "@/lib/missions/lifecycle";
import { ensureExecutionsTable } from "@/lib/runtime/ensure";
import { enqueueMissionExecutionJob } from "@/lib/runtime/durableJobs";
import { createRequestId, recordRuntimeTelemetry } from "@/lib/observability/runtimeTelemetry";
import { sanitizeError } from "@/lib/security/sanitize";
import { getMissionGraphSerialOrder } from "@plutao/domain";
import { ensurePersistedMissionGraph, MissionGraphPersistenceError } from "@/lib/missions/graphPersistence";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — cria uma execution e a deixa PENDING para o worker durável.
 *
 * Este endpoint é somente enqueue: não reivindica o job e não executa o
 * agent loop dentro da requisição HTTP. O worker autenticado é a autoridade
 * normal de processamento e de conclusão do job.
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

  const missionStatus = String(mission.status).toUpperCase();
  if (isMissionStatus(missionStatus) && TERMINAL_STATUSES.has(missionStatus)) {
    return NextResponse.json(
      {
        ok: false,
        missionId,
        finalStatus: missionStatus,
        error: "ALREADY_TERMINAL",
        message: "Missão já finalizada",
      },
      { status: 409 }
    );
  }

  const requestId = createRequestId(req.headers.get("x-request-id"));

  try {
    await ensureExecutionsTable();
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

    const graph = await ensurePersistedMissionGraph(missionId, user.id);
    const serialOrder = getMissionGraphSerialOrder(graph);
    if (!serialOrder) {
      return NextResponse.json(
        {
          ok: false,
          missionId,
          error: "MISSION_GRAPH_SERIAL_LIMIT",
          message: "O worker serial aceita até 20 nós por execução nesta etapa.",
        },
        { status: 422 }
      );
    }

    const queued = await enqueueMissionExecutionJob({
      missionId,
      userId: user.id,
      currentTaskId,
      conversationId,
      maxIterations,
      maxAttempts: 10 + serialOrder.length * 4,
      requestId,
    });
    const jobStatus = String(queued.job.status).toUpperCase();
    const executionStatus = String(queued.execution.status).toUpperCase();

    await recordRuntimeTelemetry({
      userId: user.id,
      requestId,
      missionId,
      executionId: queued.execution.id,
      jobId: queued.job.id,
      status: "queued",
      metadata: {
        source: "autonomous-run",
        durableQueue: true,
        jobStatus,
        executionStatus,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        queued: jobStatus === "PENDING" || jobStatus === "RUNNING",
        missionId,
        executionId: queued.execution.id,
        jobId: queued.job.id,
        status: jobStatus,
        executionStatus,
        message:
          jobStatus === "RUNNING"
            ? "Missão já está em processamento pelo worker durável"
            : "Missão enfileirada para execução durável",
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof MissionGraphPersistenceError) {
      return NextResponse.json(
        { ok: false, missionId, error: error.code },
        { status: error.code === "MISSION_NOT_FOUND" ? 404 : 409 }
      );
    }
    const safeError = sanitizeError(error, "DURABLE_QUEUE_UNAVAILABLE");
    console.error("[missions/:id/autonomous-run enqueue]", safeError);
    await recordRuntimeTelemetry({
      userId: user.id,
      requestId,
      missionId,
      status: "failed",
      errorType: "DURABLE_QUEUE_UNAVAILABLE",
      error: safeError,
      metadata: { source: "autonomous-run", durableQueue: false },
    });
    return NextResponse.json(
      {
        ok: false,
        missionId,
        error: "DURABLE_QUEUE_UNAVAILABLE",
        message: "O worker durável está indisponível. A missão não foi executada.",
      },
      { status: 503 }
    );
  }
}
