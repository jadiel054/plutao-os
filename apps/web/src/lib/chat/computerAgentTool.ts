/**
 * TOOL "computer" — NIX OPERA O NAVEGADOR REMOTO (Parte 2 da auditoria).
 *
 * É a ferramenta que torna o fluxo funcional REAL: Nix recebe a tarefa,
 * localiza o sistema (GitHub/Vercel/contexto) e opera o site no Chromium
 * remoto como um usuário — mouse, teclado, navegação — sempre com:
 *  - controller DURÁVEL confirmado como "agent" ANTES de cada comando
 *    (não confirmado → nenhum comando CDP é enviado — fail-safe);
 *  - controle humano ATIVO → a recusa é imediata (pausa real do agente);
 *  - navegação pelo guard de URLs (SSRF: loopback/privadas/metadata);
 *  - CHECKPOINT durável atualizado a cada ação (objective/etapas/URL/
 *    estado do navegador) — a retomada não depende de nova mensagem;
 *  - TELA DE LOGIN: se detectada e SEM credencial autorizada no cofre do
 *    runtime, Nix pede intervenção humana (requestHumanIntervention) — o
 *    botão "Assumir controle" aparece na mensagem do Chat. Nix nunca pede
 *    senha no chat e nunca procura senhas em arquivos/logs/env/repositórios;
 *    após o login ele continua usando a SESSÃO autenticada (cookies vivem
 *    no navegador, não no agente).
 */
import { assertPublicHttpUrl } from "@/lib/computer/urlGuard";
import { computerSessions } from "@/lib/computer/sessionManager";
import type { ComputerBrowserAction } from "@/lib/computer/provider";
import type { ToolName, ToolResult } from "@/lib/runtime/tools/types";
import {
  getLatestCheckpoint,
  requestHumanIntervention,
  saveComputerCheckpoint,
  type ComputerCheckpoint,
} from "./computerFlow";
import { isHumanInControl } from "./buildRunner";

type AgentComputerInput = Partial<{
  objective: string;
  currentStep: string;
  nextAction: string;
  kind: string;
  type: string;
  url: string;
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  button: string;
  text: string;
}>;

export const MAX_AGENT_INPUT_TEXT = 64;

export type ParsedAgentComputerInput = {
  action: ComputerBrowserAction;
  objective?: string;
  currentStep?: string;
  nextAction?: string;
};

export function parseAgentComputerInput(raw: string): ParsedAgentComputerInput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as AgentComputerInput;
  if (typeof p.kind !== "string" || !p.kind) return null;
  const meta = {
    objective: typeof p.objective === "string" && p.objective.trim() ? p.objective.trim() : undefined,
    currentStep: typeof p.currentStep === "string" && p.currentStep.trim() ? p.currentStep.trim() : undefined,
    nextAction: typeof p.nextAction === "string" && p.nextAction.trim() ? p.nextAction.trim() : undefined,
  };
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  if (p.kind === "navigate") {
    if (typeof p.url !== "string") return null;
    const url = assertPublicHttpUrl(p.url);
    if (!url.ok) return null;
    return { action: { kind: "navigate", url: url.url }, ...meta };
  }
  if (p.kind === "mouse") {
    const x = num(p.x); const y = num(p.y);
    if (x === null || y === null) return null;
    const type = p.type === "move" || p.type === "down" || p.type === "up" || p.type === "click" ? p.type : null;
    if (!type) return null;
    return { action: { kind: "mouse", type, x, y, button: "left", clickCount: 1 }, ...meta };
  }
  if (p.kind === "key") {
    if (typeof p.text !== "string" || !p.text || p.text.length > MAX_AGENT_INPUT_TEXT) return null;
    return { action: { kind: "key", type: "press", text: p.text }, ...meta };
  }
  if (p.kind === "scroll") {
    const x = num(p.x); const y = num(p.y); const dx = num(p.deltaX); const dy = num(p.deltaY);
    if (x === null || y === null || dx === null || dy === null) return null;
    return { action: { kind: "scroll", x, y, deltaX: dx, deltaY: dy }, ...meta };
  }
  return null;
}

function toolFailure(tool: string, error: string, message: string): ToolResult {
  return { ok: false, tool, input: "", error, message, durationMs: 0 };
}

function mergeCheckpoint(
  previous: ComputerCheckpoint | null,
  input: ParsedAgentComputerInput,
  pageUrl: string | null,
  sessionId: string | null,
  sessionStatus: string | null
): ComputerCheckpoint {
  return {
    objective: input.objective?.trim()
      ? input.objective.trim()
      : previous?.objective || "tarefa no navegador remoto",
    currentStep: input.currentStep?.trim()
      ? input.currentStep.trim()
      : previous?.currentStep || "",
    completedActions: previous?.completedActions ?? [],
    nextAction: input.nextAction?.trim()
      ? input.nextAction.trim()
      : previous?.nextAction || "",
    pageUrl,
    browserSession: { sessionId, status: sessionStatus },
    humanIntervention: previous?.humanIntervention ?? { note: null, resolvedAt: null },
    updatedAt: Date.now(),
  };
}

/**
 * Executa UM passo do agente no navegador remoto. Retorna ToolResult —
 * o loop do build flow injeta no contexto do modelo.
 */
export async function runComputerAgentStep(opts: {
  userId: string;
  conversationId: string | null;
  input: string;
  tool?: ToolName;
}): Promise<ToolResult> {
  const tool: ToolName = opts.tool ?? "computer";
  if (!opts.conversationId) {
    return toolFailure(tool, "NO_CONVERSATION", "O computador remoto opera dentro de uma conversa.");
  }

  // CONTROLE HUMANO ATIVO → o agente NÃO executa nada (pausa real).
  if (await isHumanInControl(opts.conversationId, opts.userId)) {
    return toolFailure(
      tool,
      "HUMAN_IN_CONTROL",
      "Usuário está no controle do navegador — aguardando devolução para continuar."
    );
  }

  // CONFIRMAÇÃO DURÁVEL: sem confirmação de quem controla, NENHUM comando.
  const durable = await computerSessions
    .durableControllerState(opts.conversationId, opts.userId)
    .catch(() => "unknown" as const);
  if (durable === "human") {
    return toolFailure(tool, "HUMAN_IN_CONTROL", "Controle humano ativo (durável) — agente pausado.");
  }
  if (durable !== "agent") {
    return toolFailure(
      tool,
      "CONTROL_UNCONFIRMED",
      "Não foi possível confirmar quem controla a máquina — nenhum comando CDP enviado."
    );
  }

  const parsed = parseAgentComputerInput(opts.input);
  if (!parsed) {
    return toolFailure(
      tool,
      "INVALID_INPUT",
      "Use {\"kind\":\"navigate\"|\"mouse\"|\"key\"|\"scroll\", ...}. Informe objective/currentStep/nextAction junto da ação para manter o checkpoint."
    );
  }

  const session =
    (await computerSessions.ensureSession(opts.conversationId, opts.userId).catch(() => null)) ??
    (await computerSessions.reserve({ conversationId: opts.conversationId, userId: opts.userId }).then(
      (r) => (r.ok ? r.session : null),
      () => null
    ));
  if (!session) {
    return toolFailure(
      tool,
      "SESSION_UNAVAILABLE",
      "Sessão de navegador indisponível (cota Free, concorrência ou persistência) — informe o usuário com honestidade."
    );
  }

  try {
    const snap = session.snapshot();
    const result = await session.executeAction(parsed.action);
    const sessionId = snap.sessionId;
    if (opts.conversationId) {
      const updated = mergeCheckpoint(
        await getLatestCheckpoint(opts.conversationId).catch(() => null),
        parsed,
        result?.pageUrl ?? null,
        sessionId,
        session.snapshot().status
      );
      if (result?.pageUrl || parsed.objective) {
        updated.completedActions = [
          ...updated.completedActions,
          (parsed.action.kind === "navigate"
            ? `navegou para ${parsed.action.url}`
            : `${parsed.action.kind} em (${parsed.action.kind === "mouse" || parsed.action.kind === "scroll" ? `${parsed.action.x},${parsed.action.y}` : "teclado"})`)
            + (result?.isLogin ? " → tela de login detectada" : ""),
        ].slice(-20);
      }
      await saveComputerCheckpoint(opts.conversationId, updated).catch(() => undefined);
    }

    if (result?.isLogin && result.pageUrl) {
      // Cofre do runtime: não há credencial autorizada de site → intervenção.
      await requestHumanIntervention(opts.conversationId, {
        reason: `Tela de login detectada (${result.pageUrl}) — sem credencial autorizada no cofre do runtime.`,
        instruction:
          "Assuma o controle e faça o login DIRETO no navegador isolado. NUNCA cole senha ou token no chat — só ali, na tela real.",
        checkpoint: mergeCheckpoint(
          await getLatestCheckpoint(opts.conversationId).catch(() => null),
          { ...parsed, currentStep: "aguardando login do usuário na página de login", nextAction: "continuar a tarefa após o login (sessão autenticada viva no navegador)" },
          result.pageUrl,
          sessionId,
          session.snapshot().status
        ),
      }).catch(() => undefined);
      return {
        ok: true,
        tool,
        input: "",
        output: JSON.stringify({
          status: "WAITING_HUMAN_LOGIN",
          pageUrl: result.pageUrl,
          detail:
            "Tela de login detectada. O usuário foi convidado a assumir o controle e fazer login no navegador isolado; a tarefa será retomada do checkpoint após a devolução.",
        }),
        durationMs: 0,
      } satisfies ToolResult;
    }

    return {
      ok: true,
      tool,
      input: "",
      output: JSON.stringify({
        status: "ACTION_OK",
        pageUrl: result?.pageUrl ?? null,
        pageTitle: result?.pageTitle ?? null,
      }),
      durationMs: 0,
    } satisfies ToolResult;
  } catch (error) {
    return toolFailure(
      tool,
      "ACTION_FAILED",
      error instanceof Error ? error.message : "falha ao executar ação no navegador remoto"
    );
  }
}
