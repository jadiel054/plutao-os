import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { conversationEvents, conversations } from "@plutao/db";
import { getDb } from "@/lib/db";
import { COMPUTER_CONTROL_TTL_MS } from "@/lib/chat/computer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/computer/pending — intervenções do Computador do Plutão PENDENTES
 * para o usuário logado, com a SUPERFÍCIE DE ORIGEM de cada uma (auditoria:
 * aprovação/intervenção aparecem onde o trabalho começou — missão criada no
 * Cockpit é resolvida NO Cockpit; criada no Chat, no Chat).
 *
 * Critério (mesmo contrato de readControlFromEvents): último evento
 * state_update source="computer" de cada conversa do usuário com
 * state = waiting_human OU controller = human (dentro do TTL de 30 min).
 * Nenhum payload sensível é retornado — apenas objective/nextAction/instruction.
 */
export async function GET() {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const db = getDb();
    // Último evento do computador por conversa do usuário (dedup em memória).
    const rows = await db
      .select({
        conversationId: conversationEvents.conversationId,
        payload: conversationEvents.payload,
        createdAt: conversationEvents.createdAt,
      })
      .from(conversationEvents)
      .innerJoin(conversations, eq(conversations.id, conversationEvents.conversationId))
      .where(
        and(
          eq(conversationEvents.source, "computer"),
          eq(conversationEvents.type, "state_update"),
          // Conversas do usuário (ownership no banco, não só na API).
          sql`${conversations.userId} = ${user.id}`
        )
      )
      .orderBy(desc(conversationEvents.conversationId), desc(conversationEvents.seq))
      .limit(500);

    const seen = new Set<string>();
    const now = Date.now();
    const pending: Array<{
      conversationId: string;
      state: string;
      controller: string;
      objective: string | null;
      nextAction: string | null;
      instruction: string | null;
      surface: "chat" | "cockpit";
      at: number | null;
    }> = [];

    for (const row of rows) {
      if (seen.has(row.conversationId)) continue;
      seen.add(row.conversationId);
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (payload.computer !== true) continue;
      const state = typeof payload.state === "string" ? payload.state : "";
      const controller = payload.controller === "human" ? "human" : "agent";
      const at = typeof payload.at === "number" ? payload.at : row.createdAt ? new Date(row.createdAt).getTime() : Number.NaN;
      // TTL: controle humano antigo expira (mesma regra de readControlFromEvents).
      const humanFresh = controller === "human" && Number.isFinite(at) && now - at <= COMPUTER_CONTROL_TTL_MS;
      const isPending = state === "waiting_human" || humanFresh;
      if (!isPending) continue;
      const checkpoint = (payload.checkpoint ?? null) as Record<string, unknown> | null;
      pending.push({
        conversationId: row.conversationId,
        state,
        controller,
        objective: typeof checkpoint?.objective === "string" ? checkpoint.objective : typeof payload.detail === "string" ? payload.detail : null,
        nextAction: typeof checkpoint?.nextAction === "string" ? checkpoint.nextAction : null,
        instruction: typeof payload.detail === "string" ? payload.detail : null,
        // SUPERFÍCIE DE ORIGEM: conversas criadas pelo Cockpit (missões) são
        // resolvidas no Cockpit; as demais, no Chat.
        surface: "cockpit",
        at: Number.isFinite(at) ? at : null,
      });
    }

    return NextResponse.json({ pending });
  } catch {
    // Fail-safe: sem listagem, o Cockpit simplesmente não mostra card.
    return NextResponse.json({ pending: [] });
  }
}
