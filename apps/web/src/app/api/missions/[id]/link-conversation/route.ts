import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedConversation, getOwnedMission } from "@/lib/missions/ownership";
import { getDb } from "@/lib/db";
import { emitMissionEvent } from "@/lib/events/missionEventEmitter";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — vincula uma conversa existente à missão (associação persistida no
 * banco, com ownership validado server-side; o conversationId do cliente nunca
 * é confiado sem verificação).
 *
 * Regras:
 *  - idempotente: vincular a MESMA conversa novamente retorna ok (retry seguro);
 *  - troca de vínculo (missão já ligada a OUTRA conversa) é recusada com 409;
 *    nenhuma mensagem ou evento anterior é transferido ou duplicado;
 *  - eventos: a partir do vínculo, a execução passa a registrar em
 *    conversation_events via emitMissionEvent; o histórico anterior da conversa
 *    e da missão permanece intacto (sem backfill).
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

  const body = await req.json().catch(() => ({}));
  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId obrigatório" }, { status: 400 });
  }
  if (!(await getOwnedConversation(conversationId, user.id))) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  if (mission.conversationId === conversationId) {
    return NextResponse.json({ ok: true, alreadyLinked: true, conversationId });
  }
  if (mission.conversationId) {
    return NextResponse.json(
      {
        ok: false,
        error: "MISSION_ALREADY_LINKED",
        message:
          "Missão já está vinculada a outra conversa. A troca de vínculo não é permitida nesta etapa.",
      },
      { status: 409 }
    );
  }

  try {
    const db = getDb();
    const updated = await db
      .update(missions)
      .set({ conversationId, updatedAt: new Date() })
      .where(and(eq(missions.id, missionId), eq(missions.userId, user.id)))
      .returning({ conversationId: missions.conversationId });
    if (updated[0]?.conversationId !== conversationId) {
      return NextResponse.json({ ok: false, error: "LINK_FAILED" }, { status: 500 });
    }
    try {
      await emitMissionEvent({
        conversationId,
        missionId,
        phase: "linked",
        title: "Missão vinculada a esta conversa",
        detail: "Eventos da execução passam a ser registrados aqui a partir de agora",
      });
    } catch {
      /* evento de vínculo é best-effort */
    }
    return NextResponse.json({ ok: true, alreadyLinked: false, conversationId });
  } catch (err) {
    console.error("[POST /api/missions/:id/link-conversation]", err);
    return NextResponse.json({ ok: false, error: "LINK_FAILED" }, { status: 500 });
  }
}
