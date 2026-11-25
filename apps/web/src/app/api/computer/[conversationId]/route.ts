import { NextRequest, NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership } from "@/app/api/conversations/[id]/route";
import {
  emitComputerState,
  getComputerController,
  releaseComputerControl,
  takeComputerControl,
} from "@/lib/chat/computer";
import { computerSessions } from "@/lib/computer/sessionManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/computer/:conversationId — estado do controle da máquina.
 * POST /api/computer/:conversationId — assume ou devolve o controle.
 *
 * Com navegador real ativo, a troca exige CAS exclusivo no sessionManager
 * (nada de simultaneidade agente × humano); o evento do computador é apenas
 * o registro observável no Chat — NÃO é mais a garantia de exclusividade.
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
  const session = computerSessions.activeFor(conversationId, user.id);
  // Controller DURÁVEL quando não há canal local: o CAS fica no store (Neon)
  // e é legível por qualquer instância.
  const durableController = session ? null : await computerSessions.isHumanInControlDurable(conversationId, user.id);
  return NextResponse.json({
    controller: session
      ? session.snapshot().controller
      : durableController
        ? "human"
        : await getComputerController(conversationId),
    remoteSession: session ? connectionView(session.snapshot()) : null,
  });
}

function connectionView(snap: { status: string; controller: string; leaseExpiresAt: number }) {
  return { status: snap.status, controller: snap.controller, leaseExpiresAt: snap.leaseExpiresAt };
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

  const session = computerSessions.activeFor(conversationId, user.id);
  if (session) {
    const cas =
      body.action === "takeover"
        ? await computerSessions.takeHumanControl(conversationId, user.id)
        : await computerSessions.releaseToAgent(conversationId, user.id);
    if (!cas.ok) {
      const inflight = cas.reason === "ACTION_INFLIGHT";
      return NextResponse.json(
        {
          error: inflight ? "ACTION_INFLIGHT" : "CONTROL_CONFLICT",
          message:
            cas.reason === "SESSION_NOT_FOUND"
              ? "Nenhuma sessão ativa desta conversa."
              : inflight
                ? "Ainda há uma ação do usuário em andamento — aguarde para devolver o controle."
                : body.action === "takeover"
                  ? "Outro controle já está ativo — não há simultaneidade."
                  : "O controle já está com o agente.",
          controller: cas.controller,
        },
        { status: 409 }
      );
    }
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
