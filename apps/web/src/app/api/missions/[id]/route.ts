import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import {
  canTransition,
  isMissionStatus,
  nextStatuses,
  TERMINAL_STATUSES,
  type MissionStatus,
} from "@/lib/missions/lifecycle";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(missions)
      .where(and(eq(missions.id, id), eq(missions.userId, user.id)))
      .limit(1);

    const mission = rows[0];
    if (!mission) {
      return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
    }
    const status = String(mission.status);
    return NextResponse.json({
      mission,
      allowedTransitions: nextStatuses(status),
    });
  } catch (e) {
    console.error("[missions/:id GET]", e);
    return NextResponse.json({ error: "Falha ao carregar missão" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const action = String(body.action ?? "");

    const db = getDb();
    const existing = await db
      .select({ id: missions.id, status: missions.status })
      .from(missions)
      .where(and(eq(missions.id, id), eq(missions.userId, user.id)))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
    }

    const from = String(existing[0].status);

    let to: MissionStatus;

    if (action === "cancel") {
      if (TERMINAL_STATUSES.has(from as MissionStatus)) {
        return NextResponse.json({ error: "Missão já finalizada" }, { status: 409 });
      }
      to = "CANCELLED";
    } else if (action === "transition") {
      const target = String(body.toStatus ?? "");
      if (!isMissionStatus(target)) {
        return NextResponse.json({ error: "Status inválido" }, { status: 400 });
      }
      if (!canTransition(from, target)) {
        return NextResponse.json(
          {
            error: "Transição não permitida",
            from,
            to: target,
            allowed: nextStatuses(from),
          },
          { status: 409 }
        );
      }
      to = target;
    } else {
      return NextResponse.json({ error: "Ação não suportada" }, { status: 400 });
    }

    const updated = await db
      .update(missions)
      .set({
        status: to,
        currentState: to,
        updatedAt: new Date(),
      })
      .where(and(eq(missions.id, id), eq(missions.userId, user.id)))
      .returning({
        id: missions.id,
        objective: missions.objective,
        status: missions.status,
        currentState: missions.currentState,
        updatedAt: missions.updatedAt,
      });

    return NextResponse.json({
      mission: updated[0],
      allowedTransitions: nextStatuses(to),
    });
  } catch (e) {
    console.error("[missions/:id PATCH]", e);
    return NextResponse.json({ error: "Falha ao atualizar missão" }, { status: 500 });
  }
}
