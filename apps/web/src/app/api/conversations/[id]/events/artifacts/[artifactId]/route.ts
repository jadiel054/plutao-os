import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { eventArtifacts } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership } from "@/app/api/conversations/[id]/route";

export const runtime = "nodejs";

/**
 * GET /api/conversations/:id/events/artifacts/:artifactId
 * Conteúdo completo do artefato (já scrubbed no write). Ownership obrigatório.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id, artifactId } = await params;
  const check = await checkConversationOwnership(id, user.id);
  if (check.status === 404) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(eventArtifacts)
      .where(
        and(
          eq(eventArtifacts.id, artifactId),
          eq(eventArtifacts.conversationId, id)
        )
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Artefato não encontrado" }, { status: 404 });
    }
    return new NextResponse(row.content, {
      status: 200,
      headers: {
        "Content-Type": (row.contentType as string) || "text/plain; charset=utf-8",
        "Cache-Control": "private, max-age=60",
        "X-Artifact-Chars": String(row.charCount ?? row.content.length),
      },
    });
  } catch (err) {
    console.error("[events/artifacts GET]", err);
    return NextResponse.json({ error: "Erro ao ler artefato" }, { status: 500 });
  }
}
