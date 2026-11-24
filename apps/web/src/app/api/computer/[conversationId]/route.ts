import { NextRequest, NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership } from "@/app/api/conversations/[id]/route";
import {
  emitComputerState,
  getComputerController,
  releaseComputerControl,
  takeComputerControl,
} from "@/lib/chat/computer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/computer/:conversationId — estado do controle da máquina.
 * POST /api/computer/:conversationId — assume ou devolve o controle.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { conversationId } = await params;
  const check = await checkConversationOwnership(conversationId, user.id);
  if (check.status === 404) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ controller: await getComputerController(conversationId) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { conversationId } = await params;
  const check = await checkConversationOwnership(conversationId, user.id);
  if (check.status === 404) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  let body: { action?: unknown };
  try {
    body = (await req.json()) as { action?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.action !== "takeover" && body.action !== "release") {
    return NextResponse.json(
      { error: "Use action: takeover | release" },
      { status: 400 }
    );
  }

  const controller =
    body.action === "takeover"
      ? await takeComputerControl(conversationId)
      : await releaseComputerControl(conversationId);

  await emitComputerState(
    conversationId,
    controller === "human" ? "human_control" : "working",
    controller === "human"
      ? "usuário assumiu o controle (mouse e teclado dele)"
      : "controle devolvido ao agente"
  );

  return NextResponse.json({ controller });
}
