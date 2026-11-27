import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, asc } from "drizzle-orm";
import { conversations, messages } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { extractGateIdsFromMessages, lookupGatesForUser, reconstructMessagesGateStatus } from "@/lib/chat/gateLookup";

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

    const gateIds = extractGateIdsFromMessages(msgRows);
    if (gateIds.length === 0) {
      return NextResponse.json({ messages: msgRows });
    }

    const gateMap = await lookupGatesForUser(user.id, gateIds);
    const updatedMsgRows = reconstructMessagesGateStatus(msgRows, gateMap);

    return NextResponse.json({ messages: updatedMsgRows });
  } catch (err) {
    console.error("[GET /api/conversations/[id]/messages]", err);
    return NextResponse.json({ error: "Erro ao buscar mensagens" }, { status: 500 });
  }
}

const MAX_LOCAL_CONTENT = 24_000;

/**
 * POST /api/conversations/:id/messages
 * Persiste par user+assistant gerado NO MODO LOCAL (inferência no dispositivo),
 * mantendo compatibilidade com o histórico cloud (mesma tabela/messages).
 * Idempotência: metadata.clientMessageId — reenvio/retry não duplica.
 */
export async function POST(
  req: NextRequest,
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
      .select({ id: conversations.id, userId: conversations.userId })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (convRows.length === 0 || convRows[0].userId !== user.id) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }
    const userText = typeof body.userText === "string" ? body.userText.slice(0, MAX_LOCAL_CONTENT) : "";
    const assistantText =
      typeof body.assistantText === "string" ? body.assistantText.slice(0, MAX_LOCAL_CONTENT) : "";
    if (!assistantText.trim()) {
      return NextResponse.json({ error: "assistantText é obrigatório" }, { status: 400 });
    }
    const clientMessageId =
      typeof body.clientMessageId === "string" && body.clientMessageId.trim()
        ? body.clientMessageId.trim().slice(0, 64)
        : null;
    const localModel = typeof body.model === "string" ? body.model.slice(0, 120) : null;

    // Dedupe: mesma clientMessageId já persistida nesta conversa → no-op.
    if (clientMessageId) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await db
        .select({ metadata: messages.metadata })
        .from(messages)
        .where(and(eq(messages.conversationId, id), gt(messages.createdAt, cutoff)))
        .orderBy(asc(messages.createdAt))
        .limit(200);
      const already = recent.some(
        (m) =>
          m.metadata &&
          typeof m.metadata === "object" &&
          (m.metadata as Record<string, unknown>).clientMessageId === clientMessageId
      );
      if (already) {
        return NextResponse.json({ persisted: false, duplicate: true });
      }
    }

    const now = new Date();
    const values: Array<{ conversationId: string; role: string; content: string; metadata: Record<string, unknown> | null; createdAt: Date }> = [];
    if (userText.trim()) {
      values.push({
        conversationId: id,
        role: "user",
        content: userText,
        metadata: clientMessageId ? { clientMessageId, origin: "local" } : { origin: "local" },
        createdAt: now,
      });
    }
    values.push({
      conversationId: id,
      role: "assistant",
      content: assistantText,
      metadata: { origin: "local", model: localModel, ...(clientMessageId ? { clientMessageId } : {}) },
      createdAt: new Date(now.getTime() + 10),
    });
    await db.insert(messages).values(values);

    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id));

    return NextResponse.json({ persisted: true, duplicate: false });
  } catch (err) {
    console.error("[POST /api/conversations/[id]/messages]", err);
    return NextResponse.json({ error: "Erro ao persistir mensagens locais" }, { status: 500 });
  }
}
