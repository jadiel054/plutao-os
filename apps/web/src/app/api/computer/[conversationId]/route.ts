import { NextRequest, NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership } from "@/app/api/conversations/[id]/route";
import {
  emitComputerState,
  getComputerController,
  releaseComputerControl,
  takeComputerControl,
} from "@/lib/chat/computer";
import {
  resolveHumanIntervention,
} from "@/lib/chat/computerFlow";
import { resumeAfterHumanReturn } from "@/lib/chat/computerResume";
import { computerSessions } from "@/lib/computer/sessionManager";
import type { DurableControllerState } from "@/lib/computer/sessionManager";
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
 *
 * FONTE DA VERDADE (auditoria): controle de sessão REAL é decidido SEMPRE
 * pelo estado PERSISTIDO — `agent` (confirmado), `human` (confirmado) ou
 * `unknown` (NÃO confirmado). `unknown` NUNCA cai para o snapshot local:
 * sem confirmação durável, nenhum lado envia comandos.
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
  let durable: DurableControllerState;
  try {
    durable = await computerSessions.durableControllerState(conversationId, user.id);
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) return persistenceUnavailable();
    throw error;
  }
  // Sessão real → estado persistido prevalece sobre snapshot local. Sem
  // registro durável legível: `unknown` quando existe canal local (a UI não
  // envia input sem confirmação); só quando NÃO há máquina real a conversa
  // usa o estado legado por eventos.
  const controller =
    durable !== "unknown"
      ? durable
      : session
        ? ("unknown" as const)
        : await getComputerController(conversationId);
  return NextResponse.json({
    controller,
    remoteSession: session
      ? {
          status: session.snapshot().status,
          controller,
          leaseExpiresAt: session.snapshot().leaseExpiresAt,
        }
      : null,
  });
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

  let body: { action?: unknown; context?: unknown };
  try {
    body = (await req.json()) as { action?: unknown; context?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.action !== "takeover" && body.action !== "release") {
    return NextResponse.json(
      { error: "Use action: takeover | release" },
      { status: 400 }
    );
  }
  const context: string | null =
    body.action === "release" && typeof body.context === "string" && body.context.trim()
      ? body.context.trim().slice(0, 2000)
      : null;

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

  if (body.action === "release") {
    // Devolução com contexto OPCIONAL: persiste o resultado da intervenção
    // no checkpoint durável e RETOMA a tarefa automaticamente — sem exigir
    // nova mensagem do usuário. Falha de retomada é honesta na resposta.
    let resume: Awaited<ReturnType<typeof resumeAfterHumanReturn>> | null = null;
    try {
      await resolveHumanIntervention(conversationId, context);
    } catch {
      /* checkpoint best-effort — o CAS do controle já foi garantido */
    }
    try {
      resume = await resumeAfterHumanReturn({
        userId: user.id,
        conversationId,
        context,
      });
    } catch (error) {
      resume = {
        resumed: false,
        reason: "resume_failed",
        detail: error instanceof Error ? error.message : "falha desconhecida",
      };
    }
    return NextResponse.json({ controller, resume });
  }

  return NextResponse.json({ controller });
}
