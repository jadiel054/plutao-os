/**
 * Chat Build Runtime — criação de sistemas DENTRO da conversa.
 *
 * Separación definitiva com o Cockpit:
 *  - NÃO cria mission, NÃO enfileira runtime job, NÃO grava evidence de missão.
 *  - Executa um loop agêntico curto (modelo → tool → resultado → modelo) com
 *    tools SANDBOXADAS no namespace da conversa (filesystem, note, process e
 *    exports locais). Escritas externas de conector NÃO passam por aqui; elas
 *    continuam nos runners do chat com Write Gate (aprovação no próprio Chat).
 *  - Continuidade: os arquivos vivem no sandbox por conversationId; mensagens
 *    seguintes ("corrija este sistema") retomam o mesmo namespace.
 *
 * Proteções preservadas: sandbox de filesystem (caminhos relativos, sandbox por
 * usuário+execução), process allowlisted e env-gated, sem rede em tools locais,
 * e writes externos sempre com gate contextual.
 */

import { chatCompletion } from "@/lib/runtime/model/client";
import type { ModelConfig, ModelMessage } from "@/lib/runtime/model/types";
import { runNote } from "@/lib/runtime/tools/note";
import { runFilesystem } from "@/lib/runtime/tools/filesystem";
import { runProcess } from "@/lib/runtime/tools/process";
import { runExportTool } from "@/lib/runtime/tools/export";
import type { ToolResult } from "@/lib/runtime/tools/types";
import { buildChatBuildSystemPrompt } from "./buildPrompt";

export const CHAT_BUILD_MAX_ITERATIONS = 10;
export const CHAT_BUILD_MAX_DURATION_MS = 90_000;

/** Tools disponíveis no fluxo de criação do Chat (sandboxadas). */
export const CHAT_BUILD_TOOLS = [
  "filesystem",
  "note",
  "process",
  "files.export_markdown",
  "files.export_html",
] as const;

export type BuildStep = {
  tool: string;
  ok: boolean;
  detail: string;
};

export type ChatBuildResult = {
  executed: true;
  iterations: number;
  steps: BuildStep[];
  files: Array<{ path: string; size?: number }>;
  finalText: string;
  notice: string;
};

export type ChatBuildSkip =
  | { executed: false; reason: "not_build_intent" }
  | { executed: false; reason: "model_not_configured"; notice: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Extrai arquivos escritos/gerados de um ToolResult bem-sucedido. */
export function extractBuildFiles(result: ToolResult): Array<{ path: string; size?: number }> {
  if (!result.ok) return [];
  try {
    const parsed = JSON.parse(result.output) as unknown;
    if (!isRecord(parsed)) return [];
    const path = typeof parsed.path === "string" ? parsed.path : null;
    if (!path) return [];
    const size =
      typeof parsed.size === "number"
        ? parsed.size
        : typeof parsed.sizeBytes === "number"
          ? parsed.sizeBytes
          : undefined;
    return size !== undefined ? [{ path, size }] : [{ path }];
  } catch {
    return [];
  }
}

/**
 * Executa uma tool do fluxo de criação do Chat, isolada no namespace da conversa.
 * Somente tools sandboxadas/locais: nunca gerência de escrita externa de
 * conector (essa passa pelo Write Gate nos runners do chat).
 */
export async function dispatchChatBuildTool(opts: {
  name: string;
  input: string;
  userId: string;
  conversationId: string | null;
}): Promise<ToolResult> {
  const executionId = opts.conversationId || "chat";
  switch (opts.name) {
    case "filesystem":
      return await runFilesystem(opts.input, executionId, opts.userId);
    case "note":
      return runNote(opts.input);
    case "process":
      return await runProcess(opts.input, executionId, opts.userId);
    case "files.export_markdown":
    case "files.export_html":
      return await runExportTool(opts.name, opts.input, executionId, opts.userId);
    default:
      return {
        ok: false,
        tool: opts.name,
        input: opts.input,
        error: "TOOL_NOT_AVAILABLE_IN_BUILD",
        message:
          "Tool indisponível no fluxo de criação do Chat. Use filesystem/process/exports do sandbox ou proponha a ação de conector fora do fluxo de construção.",
        durationMs: 0,
      };
  }
}

function stepDetail(result: ToolResult): string {
  if (result.ok) return (result.output || "(ok)").slice(0, 200);
  const message = (result as { message?: string }).message;
  return `${result.error}${message ? ` — ${message}` : ""}`.slice(0, 200);
}

/**
 * Fluxo de criação do Chat: executa etapas de desenvolvimento de forma
 * autônoma e devolve progresso/resultado para ser apresentado na conversa.
 */
export async function runChatBuildFlow(opts: {
  userId: string;
  conversationId: string | null;
  userText: string;
  history: Array<{ role: string; content: string }>;
  modelConfig: ModelConfig;
  connectorBlock?: string;
  onStep?: (step: BuildStep) => void | Promise<void>;
}): Promise<ChatBuildResult | ChatBuildSkip> {
  const startedAt = Date.now();
  const steps: BuildStep[] = [];
  const files: Array<{ path: string; size?: number }> = [];
  const toolContextMessages: ModelMessage[] = [];

  const systemPrompt = buildChatBuildSystemPrompt({
    connectorBlock: opts.connectorBlock ?? "",
    conversationId: opts.conversationId,
  });

  const historyMessages: ModelMessage[] = opts.history
    .slice(-6)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  let finalText = "";
  let iterations = 0;

  while (iterations < CHAT_BUILD_MAX_ITERATIONS) {
    if (Date.now() - startedAt > CHAT_BUILD_MAX_DURATION_MS) break;
    iterations++;

    let step;
    try {
      step = await chatCompletion(opts.modelConfig, [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        ...toolContextMessages,
      ]);
    } catch (error) {
      return {
        executed: false,
        reason: "model_not_configured",
        notice: `Falha na execução de criação do Chat: ${error instanceof Error ? error.message : "erro de modelo"}.`,
      } as ChatBuildSkip;
    }

    if (!step.toolProposal) {
      finalText = step.content;
      break;
    }

    const result = await dispatchChatBuildTool({
      name: step.toolProposal.name,
      input: step.toolProposal.input,
      userId: opts.userId,
      conversationId: opts.conversationId,
    });

    const stepResult: BuildStep = {
      tool: step.toolProposal.name,
      ok: result.ok,
      detail: stepDetail(result),
    };
    steps.push(stepResult);
    await opts.onStep?.(stepResult);

    if (result.ok) {
      files.push(...extractBuildFiles(result));
    }

    toolContextMessages.push({
      role: "user",
      content: result.ok
        ? `Tool ${step.toolProposal.name} result: ${result.output || "(empty)"}`
        : `Tool ${step.toolProposal.name} error: ${result.error}${
            (result as { message?: string }).message ? ` — ${(result as { message?: string }).message}` : ""
          }`,
    });
  }

  if (!finalText) {
    finalText = steps.length
      ? `Criação em andamento: ${steps.filter((s) => s.ok).length}/${steps.length} etapas concluídas.`
      : "Não foi possível iniciar a criação agora.";
  }

  const createdFiles = files.length
    ? files.map((f) => `${f.path}${typeof f.size === "number" ? ` (${f.size} bytes)` : ""}`).join(", ")
    : "nenhum arquivo consistente registrado";

  return {
    executed: true,
    iterations,
    steps,
    files,
    finalText,
    notice:
      `RUNTIME NOTICE (CRIAÇÃO NO CHAT): fluxo de criação executado NA CONVERSA via Software Factory sandboxada. ` +
      `Nenhuma missão foi criada — não cite missões nem o Cockpit. ` +
      `Etapas executadas: ${steps.map((s) => `${s.tool}:${s.ok ? "ok" : s.detail}`).join("; ") || "nenhuma"}. ` +
      `Arquivos no sandbox da conversa: ${createdFiles}. ` +
      `Use esses dados reais para responder com o progresso e o resultado; convide o usuário a continuar/pedir ajustes na conversa.`,
  };
}
