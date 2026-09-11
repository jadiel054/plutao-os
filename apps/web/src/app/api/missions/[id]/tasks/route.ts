import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { tasks } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedMission } from "@/lib/missions/ownership";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: missionId } = await ctx.params;
  const mission = await getOwnedMission(missionId, user.id);
  if (!mission) {
    return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.missionId, missionId))
      .orderBy(asc(tasks.createdAt))
      .limit(200);
    return NextResponse.json({ tasks: rows });
  } catch (e) {
    console.error("[missions/:id/tasks GET]", e);
    return NextResponse.json({ error: "Falha ao listar tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: missionId } = await ctx.params;
  const mission = await getOwnedMission(missionId, user.id);
  if (!mission) {
    return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const description = body.description ? String(body.description).trim() : null;
    const parentTaskId = body.parentTaskId ? String(body.parentTaskId) : null;

    if (title.length < 2) {
      return NextResponse.json({ error: "Título obrigatório (mín. 2 caracteres)" }, { status: 400 });
    }

    const now = new Date();
    const db = getDb();
    const inserted = await db
      .insert(tasks)
      .values({
        id: randomUUID(),
        missionId,
        parentTaskId,
        title,
        description,
        status: "CREATED",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ task: inserted[0] }, { status: 201 });
  } catch (e) {
    console.error("[missions/:id/tasks POST]", e);
    return NextResponse.json({ error: "Falha ao criar task" }, { status: 500 });
  }
}
