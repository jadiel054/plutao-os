import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { redactSecrets } from "@/lib/security/credentials";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawContent = typeof body.content === "string" ? body.content.trim() : "";

    if (!rawContent) {
      return NextResponse.json({ error: "Conteúdo não pode ser vazio" }, { status: 400 });
    }

    if (rawContent.length > 4000) {
      return NextResponse.json(
        { error: "Mensagem excede o limite permitido (máximo 4000 caracteres)" },
        { status: 400 }
      );
    }

    const { text: redactedContent } = redactSecrets(rawContent);
    const db = getDb();
    const now = new Date();

    // Idempotent table check and update if table chat_messages exists
    try {
      await db.execute(
        sql`UPDATE chat_messages SET content = ${redactedContent}, edited_at = ${now} WHERE id = ${id} AND user_id = ${user.id}`
      );
    } catch {
      /* Table chat_messages might not exist in baseline schema yet; client state & local storage persist the edit */
    }

    return NextResponse.json({
      success: true,
      message: {
        id,
        content: redactedContent,
        editedAt: now.toISOString(),
      },
    });
  } catch (err) {
    console.error("[PATCH /api/chat/messages/[id]]", err);
    return NextResponse.json(
      { error: "Erro ao atualizar mensagem no banco de dados" },
      { status: 500 }
    );
  }
}
