import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { conversations } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { randomBytes } from "node:crypto";
import { sanitizeTitle } from "@/lib/security/sanitize";

export const runtime = "nodejs";

const MAX_TITLE_LEN = 200;

/** Exported for unit tests — ownership gate shared by PATCH/DELETE. */
export async function checkConversationOwnership(conversationId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (rows.length === 0 || rows[0].userId !== userId) {
    return { status: 404 as const, conversation: null };
  }

  return { status: 200 as const, conversation: rows[0] };
}

/**
 * PATCH body fields (all optional):
 * - title: string (1–200)
 * - isPinned: boolean
 * - projectId: string | null
 * - enableShare: boolean
 *
 * DELETE: hard delete — row removida; messages cascateiam via FK onDelete.
 * Soft delete não existe (sem deleted_at no schema). Escolha consciente:
 * histórico sensível some de verdade; UI já confirma antes de chamar.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const check = await checkConversationOwnership(id, user.id);
  if (check.status === 404) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const updateData: Partial<typeof conversations.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof body.title === "string" && body.title.trim()) {
      // H3 — título sanitizado antes de persistir.
      updateData.title = sanitizeTitle(body.title.trim().slice(0, MAX_TITLE_LEN));
    }

    if (typeof body.isPinned === "boolean") {
      updateData.isPinned = body.isPinned;
    }

    if (body.projectId !== undefined) {
      updateData.projectId =
        typeof body.projectId === "string" && body.projectId.trim()
          ? body.projectId.trim()
          : null;
    }

    if (typeof body.enableShare === "boolean") {
      if (body.enableShare) {
        updateData.shareToken =
          check.conversation!.shareToken || `conv_${randomBytes(16).toString("hex")}`;
      } else {
        updateData.shareToken = null;
      }
    }

    const db = getDb();
    const updated = await db
      .update(conversations)
      .set(updateData)
      .where(and(eq(conversations.id, id), eq(conversations.userId, user.id)))
      .returning();

    return NextResponse.json({ conversation: updated[0] });
  } catch (err) {
    console.error("[PATCH /api/conversations/[id]]", err);
    return NextResponse.json({ error: "Erro ao atualizar conversa" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const check = await checkConversationOwnership(id, user.id);
  if (check.status === 404) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  try {
    const db = getDb();
    // Hard delete: messages/artifacts ligados por FK cascade.
    await db
      .delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, user.id)));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/conversations/[id]]", err);
    return NextResponse.json({ error: "Erro ao excluir conversa" }, { status: 500 });
  }
}
