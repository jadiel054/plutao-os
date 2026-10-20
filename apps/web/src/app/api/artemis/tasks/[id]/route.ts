import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getArtemisTask, toArtemisTaskPublic } from "@/lib/artemis/service";
import { parseEvidence } from "@/lib/missions/ownership";
import { sanitizeError } from "@/lib/security/sanitize";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const task = await getArtemisTask(id, user.id);
    if (!task) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    let evidence: ReturnType<typeof parseEvidence> = [];
    let mission: { id: string; objective: string | null; status: string } | null = null;
    if (task.missionId) {
      const rows = await getDb()
        .select({ id: missions.id, objective: missions.objective, status: missions.status, evidence: missions.evidence })
        .from(missions)
        .where(and(eq(missions.id, task.missionId), eq(missions.userId, user.id)))
        .limit(1);
      const row = rows[0];
      if (row) {
        mission = { id: row.id, objective: row.objective, status: row.status };
        evidence = parseEvidence(row.evidence).filter((item) => item.metadata?.artemisTaskId === task.id);
      }
    }
    const terminal = ["done", "failed", "timeout", "cancelled"].includes(task.status);
    return NextResponse.json({
      task: toArtemisTaskPublic(task),
      mission,
      evidence,
      allowedTransitions: terminal ? [] : ["cancelled"],
    });
  } catch (error) {
    console.error("[artemis/tasks/:id GET]", sanitizeError(error));
    return NextResponse.json({ error: "ARTEMIS_TASK_UNAVAILABLE" }, { status: 503 });
  }
}
