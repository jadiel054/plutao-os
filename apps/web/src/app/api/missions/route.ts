import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedConversation } from "@/lib/missions/ownership";
import { parseMissionIntake } from "@/lib/missions/intake";
import {
  createMissionRecord,
  MissionIdempotencyConflictError,
} from "@/lib/missions/createMissionRecord";

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
        graphVersion: missions.graphVersion,
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

    const created = await createMissionRecord(user.id, input);
    return NextResponse.json(
      {
        mission: created.mission,
        ...(created.deduplicated ? { deduplicated: true } : {}),
      },
      { status: created.deduplicated ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof MissionIdempotencyConflictError) {
      return NextResponse.json(
        { error: "IDEMPOTENCY_KEY_REUSED", code: "IDEMPOTENCY_KEY_REUSED" },
        { status: 409 }
      );
    }
    console.error("[missions POST]", error);
    return NextResponse.json({ error: "Falha ao criar missão" }, { status: 500 });
  }
}
