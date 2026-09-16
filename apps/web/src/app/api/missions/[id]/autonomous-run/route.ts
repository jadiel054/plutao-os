import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedMission } from "@/lib/missions/ownership";
import { runAutonomousMissionServer } from "@/lib/cockpit/runAutonomousMissionServer";
import { ensureExecutionsTable } from "@/lib/runtime/ensure";

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
    const body = await req.json().catch(() => ({}));
    const currentTaskId = body.currentTaskId ? String(body.currentTaskId) : null;
    const maxIterations = body.maxIterations ? Number(body.maxIterations) : undefined;

    const result = await runAutonomousMissionServer({
      missionId,
      userId: user.id,
      currentTaskId,
      maxIterations,
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
