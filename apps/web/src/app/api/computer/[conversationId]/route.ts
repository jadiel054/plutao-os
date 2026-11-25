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
import { PersistenceUnavailableError } from "@/lib/computer/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/computer/:conversationId — estado do controle da máquina.
 * POST /api/computer/:conversationId — assume ou devolve o controle.
 *
 * A troca exige CAS EXCLUSIVO no plano durável (store) SEMPRE que existir
 * sessão real — com canal local ou em outra instância Vercel. O evento do
 * computador é apenas o registro observável no Chat — NÃO é a garantia de
 * exclusividade.
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
  // Controller DURÁVEL (store) tem precedência sobre o snapshot local: o CAS
  // vive no banco e é legível por qualquer instância Vercel.
  let durableIsHuman: boolean;
  try {
    durableIsHuman = await computerSessions.isHumanInControlDurable(conversationId, user.id);
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) return persistenceUnavailable();
    throw error;
  }
  const snapController = session ? session.snapshot().controller : null;
  const controller = durableIsHuman
    ? "human"
    : snapController
      ? snapController
      : await getComputerController(conversationId);
  return NextResponse.json({
    controller,
    remoteSession: session ? connectionView(session.snapshot()) : null,
  });
}

function connectionView(snap: { status: string; controller: string; leaseExpiresAt: number }) {
  return { status: snap.status, controller: snap.controller, leaseExpiresAt: snap.leaseExpiresAt };
}

function persistenceUnavailable() {
  return NextResponse.json(
    {
      error: "PERSISTENCE_UNAVAILABLE",
      message: "Control plane durável indisponível — coordenação de controle não pode ser garantida.",
    },
    { status: 503 }
  );
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

  // CAS DURÁVEL SEMPRE que exista sessão real (qualquer instância): o evento
  // de conversa NÃO substitui o CAS do banco — ele só registra no histórico.
  // Sem sessão real, mantemos a coordenação por eventos (estado sem máquina).
  let cas: Awaited<ReturnType<typeof computerSessions.takeHumanControl>>;
  try {
    cas =
      body.action === "takeover"
        ? await computerSessions.takeHumanControl(conversationId, user.id)
        : await computerSessions.releaseToAgent(conversationId, user.id);
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) return persistenceUnavailable();
    throw error;
  }
  if (!cas.ok && cas.reason !== "SESSION_NOT_FOUND") {
    const inflight = cas.reason === "ACTION_INFLIGHT";
    return NextResponse.json(
      {
        error: inflight ? "ACTION_INFLIGHT" : "CONTROL_CONFLICT",
        message: inflight
          ? "Ainda há uma ação do usuário em andamento — aguarde para devolver o controle."
          : body.action === "takeover"
            ? "Outro controle já está ativo — não há simultaneidade."
            : "O controle já está com o agente.",
        controller: cas.controller,
      },
      { status: 409 }
    );
  }

  const controller =
    cas.ok || cas.reason === "SESSION_NOT_FOUND"
      ? body.action === "takeover"
        ? await takeComputerControl(conversationId)
        : await releaseComputerControl(conversationId)
      : cas.controller;

  await emitComputerState(
    conversationId,
    controller === "human" ? "human_control" : "working",
    controller === "human"
      ? "usuário assumiu o controle (mouse e teclado dele)"
      : "controle devolvido ao agente"
  );

  return NextResponse.json({ controller });
}
