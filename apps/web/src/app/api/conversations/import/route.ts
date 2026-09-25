import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { conversations, messages } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getAuthOrGuestUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const db = getDb();

    // Check if user already has conversations in DB
    const existingCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversations)
      .where(eq(conversations.userId, user.id));

    if ((existingCount[0]?.count ?? 0) > 0) {
      return NextResponse.json({
        imported: false,
        reason: "Servidor já possui conversas cadastradas",
      });
    }

    const body = await req.json().catch(() => ({}));
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];

    const validMessages: Array<{ role: string; content: string; createdAt?: Date }> = [];
    for (const m of rawMessages) {
      if (
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant" || m.role === "system" || m.role === "tool") &&
        typeof m.content === "string" &&
        m.content.trim()
      ) {
        validMessages.push({
          role: m.role,
          content: m.content.trim(),
          createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
        });
      }
    }

    if (validMessages.length === 0) {
      return NextResponse.json({
        imported: false,
        reason: "Nenhuma mensagem válida fornecida para importação",
      });
    }

    const now = new Date();
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Conversa Importada";

    const convRows = await db
      .insert(conversations)
      .values({
        userId: user.id,
        title,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const conversationId = convRows[0]!.id;

    const messageValues = validMessages.map((m) => ({
      conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt || now,
    }));

    await db.insert(messages).values(messageValues);

    return NextResponse.json({
      imported: true,
      conversationId,
      messageCount: validMessages.length,
    });
  } catch (err) {
    console.error("[POST /api/conversations/import]", err);
    return NextResponse.json({ error: "Erro ao importar mensagens" }, { status: 500 });
  }
}
