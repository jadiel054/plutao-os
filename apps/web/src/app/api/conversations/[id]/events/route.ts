import { NextRequest, NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership } from "@/app/api/conversations/[id]/route";
import { listConversationEvents } from "@/lib/events/appendConversationEvent";

export const runtime = "nodejs";

/**
 * GET /api/conversations/:id/events?cursor=&limit=
 * Replay append-only ordenado por seq. Ownership obrigatório.
 */
export async function GET(
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
  if (check.status === 403) {
    return NextResponse.json({ error: "Acesso negado à conversa" }, { status: 403 });
  }

  // Prefer URL API over nextUrl so plain Request mocks in unit tests work.
  const searchParams = new URL(req.url).searchParams;
  const cursorRaw = searchParams.get("cursor");
  const limitRaw = searchParams.get("limit");
  const cursor =
    cursorRaw != null && cursorRaw !== "" && Number.isFinite(Number(cursorRaw))
      ? Number(cursorRaw)
      : null;
  const limit =
    limitRaw != null && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : 50;

  try {
    const { events, nextCursor } = await listConversationEvents({
      conversationId: id,
      cursor,
      limit,
    });
    return NextResponse.json({ events, nextCursor });
  } catch (err) {
    console.error("[GET /api/conversations/[id]/events]", err);
    return NextResponse.json({ error: "Erro ao listar eventos" }, { status: 500 });
  }
}
