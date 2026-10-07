import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedConversation } from "@/lib/missions/ownership";
import { matchesMissionIntake, parseMissionIntake } from "@/lib/missions/intake";

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
        projectId: missions.projectId,
        isPinned: missions.isPinned,
        shareToken: missions.shareToken,
        creationSource: missions.creationSource,
        conversationId: missions.conversationId,
        createdAt: missions.createdAt,
        updatedAt: missions.updatedAt,
      })
      .from(missions)
      .where(eq(missions.userId, user.id))
      .orderBy(desc(missions.isPinned), desc(missions.createdAt))
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }

  const parsed = parseMissionIntake(body, req.headers.get("x-idempotency-key"));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const input = parsed.input;

  try {
    if (input.conversationId) {
      const conversation = await getOwnedConversation(input.conversationId, user.id);
      if (!conversation) {
        // Do not reveal whether a conversation belonging to another user exists.
        return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
      }
    }

    const db = getDb();
    const initialDecisions = input.idempotencyKey
      ? [
          {
            type: "idempotency",
            intentId: input.idempotencyKey,
            idempotencyKey: input.idempotencyKey,
            createdAt: new Date().toISOString(),
          },
        ]
      : [];

    try {
      const inserted = await db
        .insert(missions)
        .values({
          userId: user.id,
          objective: input.objective,
          context: input.context,
          constraints: input.constraints,
          definitionOfDone: input.definitionOfDone,
          creationSource: input.creationSource,
          conversationId: input.conversationId,
          status: "CREATED",
          currentState: "CREATED",
          completedSteps: [],
          pendingSteps: [],
          evidence: [],
          errors: [],
          decisions: initialDecisions,
          idempotencyKey: input.idempotencyKey,
        })
        .returning({
          id: missions.id,
          objective: missions.objective,
          status: missions.status,
          currentState: missions.currentState,
          definitionOfDone: missions.definitionOfDone,
          creationSource: missions.creationSource,
          conversationId: missions.conversationId,
          createdAt: missions.createdAt,
          updatedAt: missions.updatedAt,
        });

      return NextResponse.json({ mission: inserted[0] }, { status: 201 });
    } catch (insertErr: unknown) {
      const errorCode =
        insertErr && typeof insertErr === "object" && "code" in insertErr
          ? (insertErr as { code?: string }).code
          : undefined;
      const isUniqueConstraintErr =
        errorCode === "23505" || String(insertErr).toLowerCase().includes("unique");

      if (input.idempotencyKey && isUniqueConstraintErr) {
        const existingRows = await db
          .select({
            id: missions.id,
            objective: missions.objective,
            status: missions.status,
            currentState: missions.currentState,
            definitionOfDone: missions.definitionOfDone,
            creationSource: missions.creationSource,
            conversationId: missions.conversationId,
            context: missions.context,
            constraints: missions.constraints,
            createdAt: missions.createdAt,
            updatedAt: missions.updatedAt,
          })
          .from(missions)
          .where(
            and(
              eq(missions.userId, user.id),
              eq(missions.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1);

        const existing = existingRows[0];
        if (existing) {
          if (!matchesMissionIntake(existing, input)) {
            return NextResponse.json(
              { error: "IDEMPOTENCY_KEY_REUSED", code: "IDEMPOTENCY_KEY_REUSED" },
              { status: 409 }
            );
          }
          return NextResponse.json(
            { mission: existing, deduplicated: true },
            { status: 200 }
          );
        }
      }

      throw insertErr;
    }
  } catch (e) {
    console.error("[missions POST]", e);
    return NextResponse.json({ error: "Falha ao criar missão" }, { status: 500 });
  }
}
