import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: missions.id,
        objective: missions.objective,
        status: missions.status,
        currentState: missions.currentState,
        definitionOfDone: missions.definitionOfDone,
        createdAt: missions.createdAt,
        updatedAt: missions.updatedAt,
      })
      .from(missions)
      .where(eq(missions.userId, user.id))
      .orderBy(desc(missions.createdAt))
      .limit(50);

    return NextResponse.json({ missions: rows });
  } catch (e) {
    console.error("[missions GET]", e);
    return NextResponse.json({ error: "Falha ao listar missões" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const objective = String(body.objective ?? "").trim();
    const context = body.context ? String(body.context).trim() : null;
    const constraints = body.constraints ? String(body.constraints).trim() : null;
    const definitionOfDone = body.definitionOfDone
      ? String(body.definitionOfDone).trim()
      : null;

    const idempotencyKey =
      req.headers.get("x-idempotency-key") ||
      (body.idempotencyKey ? String(body.idempotencyKey) : null) ||
      (body.intentId ? String(body.intentId) : null);

    if (objective.length < 3) {
      return NextResponse.json(
        { error: "Objetivo da missão é obrigatório (mín. 3 caracteres)" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Reconciliação / Idempotência: verificar se já existe missão com esta chave para o usuário
    if (idempotencyKey) {
      const existingMissions = await db
        .select({
          id: missions.id,
          objective: missions.objective,
          status: missions.status,
          currentState: missions.currentState,
          definitionOfDone: missions.definitionOfDone,
          decisions: missions.decisions,
          createdAt: missions.createdAt,
          updatedAt: missions.updatedAt,
        })
        .from(missions)
        .where(eq(missions.userId, user.id))
        .orderBy(desc(missions.createdAt))
        .limit(50);

      const matched = existingMissions.find((m) => {
        if (!Array.isArray(m.decisions)) return false;
        return (m.decisions as Array<Record<string, unknown>>).some(
          (d) =>
            d.type === "idempotency" &&
            (d.idempotencyKey === idempotencyKey || d.intentId === idempotencyKey)
        );
      });

      if (matched) {
        const { decisions: _, ...cleanMission } = matched;
        return NextResponse.json(
          { mission: cleanMission, deduplicated: true },
          { status: 200 }
        );
      }
    }

    const initialDecisions = idempotencyKey
      ? [
          {
            type: "idempotency",
            intentId: idempotencyKey,
            idempotencyKey,
            createdAt: new Date().toISOString(),
          },
        ]
      : [];

    const inserted = await db
      .insert(missions)
      .values({
        userId: user.id,
        objective,
        context,
        constraints,
        definitionOfDone,
        status: "CREATED",
        currentState: "CREATED",
        completedSteps: [],
        pendingSteps: [],
        evidence: [],
        errors: [],
        decisions: initialDecisions,
      })
      .returning({
        id: missions.id,
        objective: missions.objective,
        status: missions.status,
        currentState: missions.currentState,
        definitionOfDone: missions.definitionOfDone,
        createdAt: missions.createdAt,
        updatedAt: missions.updatedAt,
      });

    return NextResponse.json({ mission: inserted[0] }, { status: 201 });
  } catch (e) {
    console.error("[missions POST]", e);
    return NextResponse.json({ error: "Falha ao criar missão" }, { status: 500 });
  }
}
