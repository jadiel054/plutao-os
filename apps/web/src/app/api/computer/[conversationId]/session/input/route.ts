/**
 * Fases 3+4 — INPUT HUMANO REAL no navegador remoto (mouse/teclado/scroll).
 *
 * Só executa com controle humano ATIVO para esta conversa + usuário
 * (CAS no sessionManager — exclusividade atômica). Cada evento vira um
 * comando CDP real no Chromium da sessão. Reuso do terminal/filesystem
 * humanos do PR #203 fica na rota /action existente.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership } from "@/app/api/conversations/[id]/route";
import { computerSessions } from "@/lib/computer/sessionManager";
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
    if (typeof body.url !== "string" || !/^https?:\/\//i.test(body.url)) return null;
    return { kind, url: body.url };
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

  const session = computerSessions.activeFor(conversationId, user.id);
  if (!session) {
    return NextResponse.json(
      { error: "SESSION_NOT_FOUND", message: "Nenhuma sessão ativa desta conversa." },
      { status: 404 }
    );
  }

  // EXCLUSIVIDADE: touchscreen/mouse/teclado só com controle humano vigente.
  if (session.snapshot().controller !== "human") {
    return NextResponse.json(
      {
        error: "NOT_HUMAN_CONTROLLED",
        message: "Assuma o controle da máquina antes de usar mouse e teclado reais.",
        controller: session.snapshot().controller,
      },
      { status: 409 }
    );
  }

  try {
    await session.executeAction(action);
  } catch (error) {
    return NextResponse.json(
      {
        error: "ACTION_FAILED",
        message: error instanceof Error ? error.message : "falha ao executar a ação",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, controller: session.snapshot().controller });
}
