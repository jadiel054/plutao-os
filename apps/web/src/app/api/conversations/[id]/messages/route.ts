import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { conversations, messages } from "@plutao/db";
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

    if (convRows.length === 0) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    if (convRows[0].userId !== user.id) {
      return NextResponse.json({ error: "Acesso negado à conversa" }, { status: 403 });
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

    return NextResponse.json({ messages: msgRows });
  } catch (err) {
    console.error("[GET /api/conversations/[id]/messages]", err);
    return NextResponse.json({ error: "Erro ao buscar mensagens" }, { status: 500 });
  }
}
