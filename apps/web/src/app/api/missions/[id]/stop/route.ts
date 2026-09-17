import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { stopMissionExecution } from "@/lib/runtime/service";
import { recordStopOnMissionPlan } from "@/lib/missions/planEvents";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/missions/:id/stop
 * 1.3 — para execução recuperável ativa + registra no plano (View).
 * Idempotente se não houver run ativo (ainda grava evento no plano se existir).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id: missionId } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "Parado pelo usuário";

    const db = getDb();
    const owned = await db
      .select({ id: missions.id })
      .from(missions)
      .where(and(eq(missions.id, missionId), eq(missions.userId, user.id)))
      .limit(1);

    if (!owned[0]) {
      return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
    }

    const stopResult = await stopMissionExecution(missionId, user.id, reason);
    const plan = await recordStopOnMissionPlan({
      missionId,
      userId: user.id,
      reason,
      executionId: stopResult.execution?.id ?? null,
    });

    return NextResponse.json({
      ok: true,
      stoppedExecution: stopResult.stopped,
      alreadyTerminal: stopResult.stopped
        ? (stopResult as { alreadyTerminal?: boolean }).alreadyTerminal ?? false
        : false,
      noActiveRun: !stopResult.stopped && stopResult.reason === "NO_ACTIVE_RUN",
      execution: stopResult.execution,
      plan,
      reason,
    });
  } catch (e) {
    console.error("[missions/:id/stop POST]", e);
    return NextResponse.json({ error: "Falha ao parar missão" }, { status: 500 });
  }
}
