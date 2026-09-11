import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

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
    return NextResponse.json({ mission });
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

    if (action !== "cancel") {
      return NextResponse.json({ error: "Ação não suportada" }, { status: 400 });
    }

    const db = getDb();
    const existing = await db
      .select({ id: missions.id, status: missions.status })
      .from(missions)
      .where(and(eq(missions.id, id), eq(missions.userId, user.id)))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json({ error: "Missão não encontrada" }, { status: 404 });
    }
    if (existing[0].status === "COMPLETED" || existing[0].status === "CANCELLED") {
      return NextResponse.json({ error: "Missão já finalizada" }, { status: 409 });
    }

    const updated = await db
      .update(missions)
      .set({
        status: "CANCELLED",
        currentState: "CANCELLED",
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

    return NextResponse.json({ mission: updated[0] });
  } catch (e) {
    console.error("[missions/:id PATCH]", e);
    return NextResponse.json({ error: "Falha ao atualizar missão" }, { status: 500 });
  }
}
