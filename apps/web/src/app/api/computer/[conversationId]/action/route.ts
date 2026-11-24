import { NextRequest, NextResponse } from "next/server";
import { getAuthOrGuestUser } from "@/lib/auth/session";
import { checkConversationOwnership } from "@/app/api/conversations/[id]/route";
import {
  isComputerActionAllowed,
  emitComputerState,
  getComputerController,
} from "@/lib/chat/computer";
import { dispatchChatBuildTool } from "@/lib/chat/buildRunner";
import { emitAction, emitObservation } from "@/lib/events/appendConversationEvent";
import { sanitizeText } from "@/lib/security/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ACTION_INPUT_CHARS = 128 * 1024;

/**
 * POST /api/computer/:conversationId/action
 * Ação humana direto na máquina (mouse/teclado do Computador do Plutão).
 * Fail-closed: só com controle humano ativo; passa pelos MESMOS guards das
 * tools do build flow (sandbox, allowlist de process, sem rede em tools locais).
 */
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

  if (!isComputerActionAllowed(conversationId)) {
    return NextResponse.json(
      {
        error: "NOT_HUMAN_CONTROLLED",
        message:
          "Assuma o controle da máquina antes de interagir com mouse e teclado.",
        controller: getComputerController(conversationId),
      },
      { status: 409 }
    );
  }

  let body: { tool?: unknown; input?: unknown };
  try {
    body = (await req.json()) as { tool?: unknown; input?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const tool = typeof body.tool === "string" ? body.tool : "";
  if (tool !== "filesystem" && tool !== "process") {
    return NextResponse.json(
      { error: "Use tool: filesystem | process" },
      { status: 400 }
    );
  }

  let input: string;
  try {
    input = JSON.stringify(body.input ?? {});
  } catch {
    return NextResponse.json({ error: "input deve ser um objeto JSON" }, { status: 400 });
  }
  if (input.length > MAX_ACTION_INPUT_CHARS) {
    return NextResponse.json({ error: "input acima do limite permitido" }, { status: 413 });
  }

  await emitAction({
    conversationId,
    tool: `humano:${tool}`,
    inputSummary: input.slice(0, 300),
    source: "human_control",
  }).catch(() => {
    /* event log é best-effort */
  });

  const result = await dispatchChatBuildTool({
    name: tool,
    input,
    userId: user.id,
    conversationId,
  });

  await emitObservation({
    conversationId,
    tool: `humano:${tool}`,
    ok: result.ok,
    outputOrError: sanitizeText(
      result.ok
        ? (result.output || "(ok)").slice(0, 500)
        : `${result.error}${(result as { message?: string }).message ? ` — ${(result as { message?: string }).message}` : ""}`
    ),
    source: "human_control",
  }).catch(() => {
    /* event log é best-effort */
  });

  if (tool === "filesystem") {
    await emitComputerState(conversationId, "human_control", "tela atualizada por ação humana").catch(
      () => {
        /* ignore */
      }
    );
  }

  return NextResponse.json({
    ok: result.ok,
    output: result.ok ? result.output : undefined,
    error: result.ok ? undefined : result.error,
    message: result.ok ? undefined : (result as { message?: string }).message,
  });
}
