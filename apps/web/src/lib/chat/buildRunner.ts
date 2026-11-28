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
import { runComputerAgentStep } from "./computerAgentTool";
import { runGithub } from "@/lib/runtime/tools/github";
import { runVercel } from "@/lib/runtime/tools/vercel";
import { persistChatBuildArtifacts } from "./buildDelivery";
import type { ToolResult } from "@/lib/runtime/tools/types";
import { buildChatBuildSystemPrompt } from "./buildPrompt";
import {
  emitComputerState,
  getComputerController,
  tryAcquireConversationBuild,
  releaseConversationBuild,
} from "./computer";
import { computerSessions } from "@/lib/computer/sessionManager";
import {
  emitAction,
  emitObservation,
} from "@/lib/events/appendConversationEvent";

function envPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Limites do fluxo de criação no Chat. Configuráveis por ambiente (ex.: um
 * worker dedicado pode subir bem mais); os defaults permitem builds reais de
 * sistemas pequenos/médios com continuidade (o sandbox persiste entre mensagens).
 */
export const CHAT_BUILD_MAX_ITERATIONS = envPositiveInt(
  process.env.CHAT_BUILD_MAX_ITERATIONS,
  40
);
export const CHAT_BUILD_MAX_DURATION_MS = envPositiveInt(
  process.env.CHAT_BUILD_MAX_DURATION_MS,
  180_000
);

/** Tools disponíveis no fluxo de criação do Chat (sandboxadas). */
export const CHAT_BUILD_TOOLS = [
  "filesystem",
  "note",
  "process",
  "files.export_markdown",
  "files.export_html",
  "computer",
  "github",
  "vercel",
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
  /** True quando o usuário assumiu o controle e o fluxo parou na fronteira de passo. */
  pausedForHuman?: boolean;
  /**
   * Estado do ciclo de vida (execução durável):
   *  - completed: critério natural de parada (modelo sem nova tool);
   *  - continuing: orçamento esgotado com trabalho pendente → retomada
   *    automática via job durável (kind "chat_build") com checkpoint;
   *  - paused_for_human: usuário assumiu o controle;
   *  - failed: falha terminal reportada pelo worker.
   */
  status?: "completed" | "continuing" | "paused_for_human" | "failed";
  /** Checkpoint para retomada automática quando status === "continuing". */
  continuationState?: PersistedChatBuildState | null;
  /** Arquivos entregues como artifacts acessíveis (tabela artifacts). */
  artifactsPersisted?: number;
};

/** Estado serializável do build, persistido no payload do runtime job. */
export type PersistedChatBuildState = {
  iterations: number;
  files: Array<{ path: string; size?: number }>;
  toolContextMessages: ModelMessage[];
};

export type ChatBuildSkip =
  | { executed: false; reason: "not_build_intent" }
  | { executed: false; reason: "model_not_configured"; notice: string }
  | { executed: false; reason: "build_already_running"; notice: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * PAUSA DO AGENTE (fonte única): humano no controle — via evento durável
 * (legível por qualquer instância) OU via sessão remota do Computador com
 * controller verificado no CONTROL PLANE DURÁVEL (store/Neon — CAS atômico
 * entre instâncias); fallback local por instância com canal vivo.
 */
export async function isHumanInControl(
  conversationId: string | null | undefined,
  userId: string
): Promise<boolean> {
  if (!conversationId) return false;
  if ((await getComputerController(conversationId)) === "human") return true;
  // TRÊS ESTADOS duráveis: human → pausa; agent → confirmado no store, o
  // agente segue (estado persistido PREVALECE sobre snapshot local);
  // unknown → fail-safe: com canal vivo local, NÃO confirmado = pausa (o
  // agente não age sem saber quem controla); sem máquina real, nada de CDP
  // existe nesta conversa — o estado por eventos decide.
  try {
    const durable = await computerSessions.durableControllerState(conversationId, userId);
    if (durable === "human") return true;
    if (durable === "agent") {
      const session = computerSessions.activeFor(conversationId, userId);
      return session ? session.snapshot().controller === "human" : false;
    }
    return computerSessions.activeFor(conversationId, userId) !== null;
  } catch {
    // Sem control plane: com canal local não é possível confirmar o dono do
    // controle → pausa o agente (fail-safe). Persistência ocupa as rotas da
    // máquina; o fluxo do Chat sem computador segue o evento durável.
    return computerSessions.activeFor(conversationId, userId) !== null;
  }
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
    case "computer":
      return await runComputerAgentStep({ userId: opts.userId, conversationId: opts.conversationId, input: opts.input, tool: opts.name });
    case "github":
    case "vercel": {
      // Escritas externas dentro do escopo aprovado: runGithub/runVercel
      // aplicam os gates de escrita existentes (fail-closed) — a pendência
      // volta como GATE_PENDING para aprovação no próprio Chat. O erro nunca
      // derruba o fluxo de criação.
      try {
        return opts.name === "github"
          ? await runGithub(opts.input, opts.userId, executionId)
          : await runVercel(opts.input, opts.userId, executionId);
      } catch (error) {
        return {
          ok: false,
          tool: opts.name,
          input: opts.input,
          error: error instanceof Error ? error.message : "CONNECTOR_TOOL_FAILED",
          durationMs: 0,
        };
      }
    }
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
  /** Checkpoint de retomada (execução durável kind "chat_build"). */
  initialState?: PersistedChatBuildState | null;
  /** Orçamento de tempo desta fatia (worker usa o restante do seu budget). */
  budgetMs?: number;
  /** Teto de iterações desta fatia (default: CHAT_BUILD_MAX_ITERATIONS). */
  maxIterations?: number;
  /** Heartbeat cooperativo: renova o lease do job durável a cada passo. */
  onHeartbeat?: () => unknown;
}): Promise<ChatBuildResult | ChatBuildSkip> {
  const startedAt = Date.now();
  const deadlineMs = opts.budgetMs ?? CHAT_BUILD_MAX_DURATION_MS;
  const maxIterations = opts.maxIterations ?? CHAT_BUILD_MAX_ITERATIONS;
  const steps: BuildStep[] = [];
  const files: Array<{ path: string; size?: number }> = [...(opts.initialState?.files ?? [])];
  const toolContextMessages: ModelMessage[] = [...(opts.initialState?.toolContextMessages ?? [])];

  const systemPrompt = buildChatBuildSystemPrompt({
    connectorBlock: opts.connectorBlock ?? "",
    conversationId: opts.conversationId,
  });

  const historyMessages: ModelMessage[] = opts.history
    .slice(-6)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  let finalText = "";
  let iterations = opts.initialState?.iterations ?? 0;
  let pausedForHuman = false;

  if (opts.conversationId && !tryAcquireConversationBuild(opts.conversationId)) {
    return {
      executed: false,
      reason: "build_already_running",
      notice:
        "RUNTIME NOTICE: já existe um fluxo de criação em andamento nesta conversa — aguarde a conclusão antes de iniciar outro.",
    } as ChatBuildSkip;
  }

  try {
  if (opts.conversationId) {
    await emitComputerState(opts.conversationId, "working", "fluxo de criação iniciado");
  }

  const loopConversationId = opts.conversationId;
  while (iterations < maxIterations) {
    if (Date.now() - startedAt > deadlineMs) break;
    await opts.onHeartbeat?.();
    if (loopConversationId && (await isHumanInControl(loopConversationId, opts.userId))) {
      pausedForHuman = true;
      await emitComputerState(
        loopConversationId,
        "human_control",
        "usuário assumiu o controle; agente pausado na fronteira de passo"
      );
      break;
    }
    iterations++;

    let step;
    try {
      step = await chatCompletion(opts.modelConfig, [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        ...toolContextMessages,
      ]);
    } catch (error) {
      if (opts.conversationId) {
        await emitComputerState(
          opts.conversationId,
          "error",
          `falha na chamada ao modelo: ${error instanceof Error ? error.message : "desconhecida"}`
        );
      }
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

    // CORRIDA NA PAUSA: re-checagem imediatamente antes de executar a tool.
    // Se o usuário assumir o controle DURANTE a chamada ao modelo, a tool
    // proposta NÃO é executada — exclusividade agente × humano é obrigatória.
    if (loopConversationId && (await isHumanInControl(loopConversationId, opts.userId))) {
      pausedForHuman = true;
      await emitComputerState(
        loopConversationId,
        "human_control",
        "usuário assumiu o controle durante o passo; tool proposta não executada"
      );
      break;
    }

    // Eventos REAIS em tempo real e EM ORDEM: action antes da execução e
    // observation depois — awaited para que o seq monotônico preserve a ordem
    // action → observation da MESMA etapa (best-effort: falha não quebra o fluxo).
    if (opts.conversationId) {
      try {
        await emitAction({
          conversationId: opts.conversationId,
          tool: step.toolProposal.name,
          inputSummary: step.toolProposal.input.slice(0, 200),
          source: "chat_build",
        });
      } catch {
        /* event log é best-effort */
      }
    }

    const result = await dispatchChatBuildTool({
      name: step.toolProposal.name,
      input: step.toolProposal.input,
      userId: opts.userId,
      conversationId: opts.conversationId,
    });

    if (opts.conversationId) {
      try {
        await emitObservation({
          conversationId: opts.conversationId,
          tool: step.toolProposal.name,
          ok: result.ok,
          outputOrError: result.ok
            ? (result.output || "(ok)").slice(0, 500)
            : `${result.error}${(result as { message?: string }).message ? ` — ${(result as { message?: string }).message}` : ""}`,
          source: "chat_build",
        });
      } catch {
        /* event log é best-effort */
      }
    }

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

  if (!pausedForHuman && opts.conversationId) {
    await emitComputerState(
      opts.conversationId,
      steps.some((st) => !st.ok) ? "error" : "completed",
      `${steps.length} etapa(s) executada(s)`
    );
  }

  // Orçamento esgotado com trabalho pendente, calculado ANTES do fallback de
  // finalText (que preenche o texto de "em andamento"): não é conclusão — é
  // continuação automática com checkpoint no job durável.
  const budgetExhausted = !pausedForHuman && !finalText && iterations > 0;

  if (!finalText) {
    finalText = pausedForHuman
      ? "Controle assumido por você — o agente pausou. Devolva o controle e peça para continuar a criação."
      : steps.length
        ? `Criação em andamento (execução durável com checkpoint): ${steps.filter((st) => st.ok).length}/${steps.length} etapas concluídas. A execução continua automaticamente — isto NÃO é o resultado final.`
        : "Não foi possível iniciar a criação agora.";
  }

  const createdFiles = files.length
    ? files.map((f) => `${f.path}${typeof f.size === "number" ? ` (${f.size} bytes)` : ""}`).join(", ")
    : "nenhum arquivo consistente registrado";

  // Entrega persistente: snapshot dos arquivos do sandbox na tabela
  // artifacts (best-effort; a entrega nunca mascara o resultado do build).
  let artifactsPersisted = 0;
  if (!pausedForHuman) {
    try {
      const delivery = await persistChatBuildArtifacts({ userId: opts.userId, conversationId: opts.conversationId });
      artifactsPersisted = delivery.persisted;
    } catch {
      artifactsPersisted = 0;
    }
  }
  const continuing = budgetExhausted;

  return {
    executed: true,
    iterations,
    steps,
    files,
    finalText,
    ...(pausedForHuman ? { pausedForHuman: true } : {}),
    status: pausedForHuman
      ? ("paused_for_human" as const)
      : continuing
        ? ("continuing" as const)
        : ("completed" as const),
    ...(continuing
      ? { continuationState: { iterations, files, toolContextMessages } as PersistedChatBuildState }
      : {}),
    artifactsPersisted,
    notice:
      `RUNTIME NOTICE (CRIAÇÃO NO CHAT): fluxo de criação executado NA CONVERSA via Software Factory sandboxada. ` +
      `Nenhuma missão foi criada — não cite missões nem o Cockpit. ` +
      `Etapas executadas: ${steps.map((s) => `${s.tool}:${s.ok ? "ok" : s.detail}`).join("; ") || "nenhuma"}. ` +
      `Arquivos no sandbox da conversa: ${createdFiles}. `
      + `Arquivos entregues como artifacts acessíveis ao usuário: ${artifactsPersisted}. ` +
      `Use esses dados reais para responder com o progresso e o resultado; convide o usuário a continuar/pedir ajustes na conversa.` +
      (pausedForHuman
        ? ` O fluxo foi PAUSADO porque o usuário assumiu o controle do Computador (mouse/teclado dele); administre apenas o que já foi executado e NÃO invente etapas futuras. Quando o usuário devolver o controle e pedir, continue de onde parou usando o sandbox persistido.`
        : ""),
  };
  } finally {
    if (opts.conversationId) releaseConversationBuild(opts.conversationId);
  }
}
