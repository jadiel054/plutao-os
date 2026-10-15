import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { conversations, messages, writeGates } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getAuthOrGuestUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const db = getDb();
    const convRows = await db
      .select({
        id: conversations.id,
        userId: conversations.userId,
      })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (convRows.length === 0 || convRows[0].userId !== user.id) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    const msgRows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        metadata: messages.metadata,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    // Reconstrução de status de write_gates a partir da tabela write_gates para mensagens de assistente
    const gateRows = await db
      .select()
      .from(writeGates)
      .where(eq(writeGates.userId, user.id));

    const gateMap = new Map<string, typeof gateRows[0]>();
    for (const g of gateRows) {
      gateMap.set(g.id, g);
    }

    const updatedMsgRows = msgRows.map((msg) => {
      if (msg.role !== "assistant" || !msg.metadata || typeof msg.metadata !== "object") {
        return msg;
      }
      const meta = msg.metadata as Record<string, unknown>;
      let steps = Array.isArray(meta.steps) ? [...meta.steps] : undefined;
      const trace = meta.trace && typeof meta.trace === "object" ? { ...(meta.trace as Record<string, unknown>) } : undefined;

      let changed = false;

      if (steps) {
        steps = steps.map((step) => {
          if (typeof step === "object" && step !== null && (step as Record<string, unknown>).type === "tool_call") {
            const toolCall = { ...((step as Record<string, unknown>).toolCall as Record<string, unknown>) };
            const outText = String(toolCall.summaryOutput || toolCall.fullOutput || "");
            const idMatch = outText.match(
              /gate_id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
            );
            const gateId = idMatch?.[1];
            if (gateId && gateMap.has(gateId)) {
              const g = gateMap.get(gateId)!;
              if (g.status && g.status !== toolCall.status) {
                toolCall.status = g.status;
                if (g.status === "executed" && g.result && typeof g.result === "object") {
                  toolCall.summaryOutput = String((g.result as Record<string, unknown>).output || "Executado com sucesso.");
                } else if (g.status === "failed" && g.error) {
                  toolCall.summaryOutput = g.error;
                } else if (g.status === "rejected") {
                  toolCall.summaryOutput = "Recusado pelo usuário.";
                }
                changed = true;
                return { ...(step as Record<string, unknown>), toolCall };
              }
            }
          }
          return step;
        });
      }

      if (trace && Array.isArray(trace.toolCalls)) {
        const toolCalls = (trace.toolCalls as Array<Record<string, unknown>>).map((tc) => {
          const outText = String(tc.summaryOutput || tc.fullOutput || "");
          const idMatch = outText.match(
            /gate_id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
          );
          const gateId = idMatch?.[1];
          if (gateId && gateMap.has(gateId)) {
            const g = gateMap.get(gateId)!;
            if (g.status && g.status !== tc.status) {
              changed = true;
              return { ...tc, status: g.status };
            }
          }
          return tc;
        });
        trace.toolCalls = toolCalls;
      }

      if (changed) {
        return {
          ...msg,
          metadata: {
            ...meta,
            ...(steps ? { steps } : {}),
            ...(trace ? { trace } : {}),
          },
        };
      }
      return msg;
    });

    return NextResponse.json({ messages: updatedMsgRows });
  } catch (err) {
    console.error("[GET /api/conversations/[id]/messages]", err);
    return NextResponse.json({ error: "Erro ao buscar mensagens" }, { status: 500 });
  }
}
