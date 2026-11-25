/**
 * Fases 3+4 — INPUT HUMANO REAL no navegador remoto (mouse/teclado/scroll).
 *
 * Só executa com controle humano ATIVO para esta conversa + usuário,
 * verificado no CONTROL PLANE DURÁVEL (store) — e cada ação marca-se como
 * "em andamento" (human_action_until): enquanto houver ação executando, a
 * devolução do controle é RECUSADA, garantindo que nenhuma ação iniciada
 * sob controle humano continue depois que o controle voltar ao agente.
 * Navegação passa pelo guard de URLs (bloqueia endereços internos/privados).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership } from "@/app/api/conversations/[id]/route";
import { computerSessions } from "@/lib/computer/sessionManager";
import { PersistenceUnavailableError } from "@/lib/computer/store";
import { assertPublicHttpUrl } from "@/lib/computer/urlGuard";
import type { ComputerBrowserAction } from "@/lib/computer/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_CHARS = 128;

function parseAction(body: Record<string, unknown>): ComputerBrowserAction | null {
  const kind = body.kind;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  if (kind === "mouse") {
    const type = body.type;
    if (type !== "move" && type !== "down" && type !== "up" && type !== "click") return null;
    const x = num(body.x);
    const y = num(body.y);
    if (x === null || y === null || x < 0 || y < 0 || x > 4096 || y > 4096) return null;
    const button = body.button === "right" || body.button === "middle" ? body.button : "left";
    const clickCount = num(body.clickCount);
    return { kind, type, x, y, button, clickCount: clickCount && clickCount > 0 && clickCount <= 3 ? clickCount : 1 };
  }
  if (kind === "key") {
    if (body.type !== "press" && body.type !== "down" && body.type !== "up") return null;
    if (typeof body.text !== "string" || body.text.length === 0 || body.text.length > MAX_INPUT_CHARS) return null;
    return { kind, type: body.type, text: body.text };
  }
  if (kind === "scroll") {
    const x = num(body.x);
    const y = num(body.y);
    const dx = num(body.deltaX);
    const dy = num(body.deltaY);
    if (x === null || y === null || dx === null || dy === null) return null;
    return { kind, x, y, deltaX: dx, deltaY: dy };
  }
  if (kind === "navigate") {
    if (typeof body.url !== "string") return null;
    // Fase 4: endereços internos/privados (loopback, rede local, metadata)
    // são bloqueados na borda da API — além do guard no provedor.
    const url = assertPublicHttpUrl(body.url);
    if (!url.ok) return null;
    return { kind, url: url.url };
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const user = await getAuthOrGuestUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { conversationId } = await params;
  const check = await checkConversationOwnership(conversationId, user.id);
  if (check.status === 404) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    const raw = (await req.json()) as unknown;
    body = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const action = parseAction(body);
  if (!action) {
    return NextResponse.json({ error: "Ação de entrada inválida" }, { status: 400 });
  }

  // EXCLUSIVIDADE DURÁVEL: antes de executar, confere controle humano no
  // store e marca a ação em andamento — enquanto marcada (e RENOVADA durante
  // toda a execução), devolver o controle é recusado.
  let begin: Awaited<ReturnType<typeof computerSessions.beginHumanAction>>;
  try {
    begin = await computerSessions.beginHumanAction(conversationId, user.id);
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json(
        {
          error: "PERSISTENCE_UNAVAILABLE",
          message: "Control plane durável indisponível — nenhuma ação em navegador real será executada.",
        },
        { status: 503 }
      );
    }
    throw error;
  }
  if (!begin.ok) {
    const responses = {
      SESSION_NOT_FOUND: {
        status: 404,
        error: "SESSION_NOT_FOUND",
        message: "Nenhuma sessão ativa desta conversa.",
      },
      CHANNEL_BUSY: {
        status: 409,
        error: "CHANNEL_BUSY",
        message: "A sessão existe, mas o canal vivo está em outra instância — tente de novo em instantes.",
      },
      NOT_HUMAN_CONTROLLED: {
        status: 409,
        error: "NOT_HUMAN_CONTROLLED",
        message: "Assuma o controle da máquina antes de usar mouse e teclado reais.",
      },
      ACTION_INFLIGHT: {
        status: 409,
        error: "ACTION_INFLIGHT",
        message: "Já existe uma ação sua em andamento — aguarde para enviar outra.",
      },
    } as const;
    const payload = responses[begin.code];
    return NextResponse.json(
      { error: payload.error, message: payload.message },
      { status: payload.status }
    );
  }

  const session = begin.session;
  try {
    // LOCK RENOVÁVEL: a marca de ação em andamento é renovada durante TODA
    // a execução (navegação pode passar de 30s, maior que o TTL fixo) e o
    // release GARANTIDO no finally — o agente não recebe o controle enquanto
    // qualquer ação humana estiver em voo.
    await computerSessions.runHumanAction(session, () => session.executeAction(action));
  } catch (error) {
    return NextResponse.json(
      {
        error: "ACTION_FAILED",
        message: error instanceof Error ? error.message : "falha ao executar a ação",
      },
      { status: 502 }
    );
  }
  // Libera a marca de ação em andamento e informa o controlador vigente
  // (o plano durável recusou qualquer devolução durante a execução).
  const ended = await computerSessions.endHumanAction(session.id);
  return NextResponse.json({ ok: true, controller: ended.controller });
}
