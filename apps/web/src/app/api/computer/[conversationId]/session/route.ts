/**
 * Fases 3+4 — ROTAS DO NAVEGADOR REAL (sessão do Computador do Plutão).
 *
 * POST   — cria/reserva a sessão (1 por instalação; fail-closed por cota).
 * GET    — view saneada do estado (nunca token/endpoint do provedor).
 * DELETE — encerra a sessão da conversa (ação crítica confirmada na UI).
 *
 * Em toda rota: usuário autenticado + ownership da conversa. Segredos
 * ficam no servidor — o frontend só fala com o Plutão.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership } from "@/app/api/conversations/[id]/route";
import {
  emitComputerState,
  getComputerController,
  releaseComputerControl,
} from "@/lib/chat/computer";
import { computerSessions } from "@/lib/computer/sessionManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionErrorCode = "PROVIDER_UNCONFIGURED" | "SESSION_LIMIT" | "QUOTA_EXHAUSTED" | "PROVIDER_UNAVAILABLE";

const RESERVE_MESSAGES: Record<Exclude<SessionErrorCode, "PROVIDER_UNAVAILABLE">, { code: SessionErrorCode; message: string }> = {
  PROVIDER_UNCONFIGURED: {
    code: "PROVIDER_UNCONFIGURED",
    message:
      "Computador remoto não configurado no servidor (provedor exige token/endpoint de ambiente). Nada foi cobrado.",
  },
  SESSION_LIMIT: {
    code: "SESSION_LIMIT",
    message:
      "Já existe uma sessão do computador em andamento (limite do plano gratuito: 1 por instalação). Encerre-a para iniciar outra.",
  },
  QUOTA_EXHAUSTED: {
    code: "QUOTA_EXHAUSTED",
    message:
      "Cota gratuita do Browserless acabou neste mês — novas sessões estão bloqueadas. Nenhuma cobrança será feita.",
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { conversationId } = await params;
  const check = await checkConversationOwnership(conversationId, user.id);
  if (check.status === 404) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  // View DURÁVEL (store no Neon): vale entre instâncias Vercel distintas.
  const view = await computerSessions.durableView(conversationId, user.id);
  return NextResponse.json(
    {
      session: {
        sessionId: view.sessionId,
        status: view.status,
        controller: view.controller,
        provider: view.provider,
        createdAt: view.createdAt,
        leaseExpiresAt: view.leaseExpiresAt,
        lastSeenAt: view.lastSeenAt,
        unitsUsed: view.unitsUsed,
        unitsBudget: view.unitsBudget,
        error: view.error,
        activeElsewhere: view.activeElsewhere,
        channelOwner: view.channelOwner,
        persist: view.persist,
        limits: view.limits,
        screenEndpoint: view.sessionId
          ? `/api/computer/${encodeURIComponent(conversationId)}/screen/stream`
          : null,
        inputEndpoint: view.sessionId
          ? `/api/computer/${encodeURIComponent(conversationId)}/session/input`
          : null,
      },
      controller: await getComputerController(conversationId),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { conversationId } = await params;
  const check = await checkConversationOwnership(conversationId, user.id);
  if (check.status === 404) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const result = await computerSessions.reserve({ conversationId, userId: user.id });
  if (!result.ok) {
    const code: { code: SessionErrorCode; message: string } =
      result.reason === "PROVIDER_UNAVAILABLE"
        ? { code: "PROVIDER_UNAVAILABLE", message: "Falha ao conectar ao Chromium remoto." }
        : RESERVE_MESSAGES[result.reason as "PROVIDER_UNCONFIGURED" | "SESSION_LIMIT" | "QUOTA_EXHAUSTED"];
    const status = result.reason === "SESSION_LIMIT" ? 409 : result.reason === "QUOTA_EXHAUSTED" ? 402 : 503;
    return NextResponse.json(
      {
        error: code.code,
        message: code.message,
        session: computerSessions.view(conversationId, user.id),
      },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Sessão nova nasce sob controle do AGENTE (default seguro).
  await emitComputerState(conversationId, "working", "navegador real conectado (sessão nova)");
  return NextResponse.json(
    {
      session: computerSessions.view(conversationId, user.id),
      controller: await getComputerController(conversationId),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { conversationId } = await params;
  const check = await checkConversationOwnership(conversationId, user.id);
  if (check.status === 404) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }
  const closed = await computerSessions.closeConversation(conversationId, user.id);
  if (!closed) {
    return NextResponse.json(
      { error: "SESSION_NOT_FOUND", message: "Nenhuma sessão ativa desta conversa." },
      { status: 404 }
    );
  }
  await releaseComputerControl(conversationId).catch(() => undefined);
  await emitComputerState(conversationId, "idle", "sessão do navegador real encerrada").catch(() => undefined);
  return NextResponse.json(
    { session: computerSessions.view(conversationId, user.id) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
