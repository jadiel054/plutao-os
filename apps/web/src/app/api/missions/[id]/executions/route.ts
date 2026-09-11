import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { executions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedMission } from "@/lib/missions/ownership";
import { ensureExecutionsTable } from "@/lib/runtime/ensure";
import {
  findRecoverableExecution,
  startExecution,
} from "@/lib/runtime/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** List executions for mission (owner only). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: missionId } = await ctx.params;
  const mission = await getOwnedMission(missionId, user.id);
  if (!mission) {
    return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
  }

  await ensureExecutionsTable();
  const db = getDb();
  const rows = await db
    .select()
    .from(executions)
    .where(eq(executions.missionId, missionId))
    .orderBy(desc(executions.createdAt))
    .limit(20);

  const recoverable = await findRecoverableExecution(missionId, user.id);
  return NextResponse.json({
    executions: rows,
    recoverable: recoverable ?? null,
  });
}

/** Start execution (idempotent: returns existing recoverable). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: missionId } = await ctx.params;
  const mission = await getOwnedMission(missionId, user.id);
  if (!mission) {
    return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const currentTaskId = body.currentTaskId ? String(body.currentTaskId) : null;

    const result = await startExecution({
      missionId,
      userId: user.id,
      currentTaskId,
    });

    return NextResponse.json(
      {
        execution: result.execution,
        created: result.created,
        recoverable: true,
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (e) {
    console.error("[missions/:id/executions POST]", e);
    return NextResponse.json({ error: "Falha ao iniciar execução" }, { status: 500 });
  }
}
