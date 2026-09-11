import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import {
  getOwnedTask,
  parseEvidence,
  type EvidenceItem,
} from "@/lib/missions/ownership";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** List evidence items for this task (from mission.evidence jsonb filtered by taskId). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: taskId } = await ctx.params;
  const owned = await getOwnedTask(taskId, user.id);
  if (!owned) {
    return NextResponse.json({ error: "Task não encontrada" }, { status: 404 });
  }

  const all = parseEvidence(owned.missionEvidence);
  const evidence = all.filter((e) => e.taskId === taskId);
  return NextResponse.json({ evidence });
}

/** Append minimal evidence to mission.evidence (linked to this task). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: taskId } = await ctx.params;
  const owned = await getOwnedTask(taskId, user.id);
  if (!owned) {
    return NextResponse.json({ error: "Task não encontrada" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const content = String(body.content ?? "").trim();
    const type = String(body.type ?? "note").trim() || "note";
    const source = String(body.source ?? "user").trim() || "user";

    if (content.length < 1) {
      return NextResponse.json({ error: "Conteúdo da evidência obrigatório" }, { status: 400 });
    }

    const item: EvidenceItem = {
      id: randomUUID(),
      type,
      content,
      source,
      taskId,
      missionId: owned.missionId,
      createdAt: new Date().toISOString(),
    };

    const prev = parseEvidence(owned.missionEvidence);
    const next = [...prev, item];

    const db = getDb();
    await db
      .update(missions)
      .set({ evidence: next, updatedAt: new Date() })
      .where(eq(missions.id, owned.missionId));

    return NextResponse.json({ evidence: item }, { status: 201 });
  } catch (e) {
    console.error("[tasks/:id/evidence POST]", e);
    return NextResponse.json({ error: "Falha ao registrar evidência" }, { status: 500 });
  }
}
