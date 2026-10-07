/**
 * Agent Loop Controller V1
 *
 * Implementa o loop automático: Model → Tool → Result → Model
 *
 * Fluxo:
 * 1. Chama runModelStep() para obter resposta do modelo
 * 2. Se modelo propôs tool, executa via dispatchTool()
 * 3. Injeta resultado da tool como mensagem de contexto
 * 4. Repete até critério de parada
 *
 * Proteções (H6 — loop de agente e queima de tokens):
 * - MAX_ITERATIONS: limite de iterações por chamada (default: 20)
 * - MAX_TOTAL_ITERATIONS: teto ACUMULADO por execution, somando todas as
 *   retomadas. Sem isso, cada novo request recomeçava o contador e o loop podia
 *   ser retomado indefinidamente (queima de tokens entre requests).
 * - MAX_LOOP_DURATION_MS: teto de tempo de parede dentro do request, para não
 *   ser cortado pela plataforma deixando a execution em RUNNING.
 * - Detecção de repetição: mesma assinatura (tool+input) ou mesmo output duas
 *   vezes seguidas → parada suave (o DoD decide o desfecho).
 * - Idempotência: reaproveita hash do dispatchTool()
 * - Verifica status da execution a cada iteração
 * - Não faz retry automático em erros
 */

import { completeExecution, getOwnedExecution, writeCheckpoint } from "./service";
import { RECOVERABLE, type ExecutionStatus } from "./types";
import { runModelStep } from "./model/step";
import { getModelConfig } from "./model/config";
import type { ModelMessage, ModelStepResult } from "./model/types";

// Limite de iterações para prevenir loop infinito (missões multi-arquivo)
export const MAX_ITERATIONS = 20;
/** H6 — teto acumulado por execution (somando retomadas). */
export const MAX_TOTAL_ITERATIONS = 60;
/** H6 — teto acumulado de tokens reportados pelo provedor por execution. */
export const MAX_TOTAL_TOKENS = 120_000;
/** H6 — teto de tempo de parede do loop dentro de um único request. */
export const MAX_LOOP_DURATION_MS = 240_000;
/** H6 — quantas vezes o mesmo output pode se repetir antes de parar. */
const MAX_IDENTICAL_OUTPUTS = 2;

/** Paradas "suaves": interrompem o gasto de tokens mas deixam o DoD decidir. */
const SOFT_STOP_REASONS = ["NO_TOOL_PROPOSAL", "REPEATED_TOOL_CALL", "NO_PROGRESS"];

export type LoopIterationResult = {
  iteration: number;
  modelResult: ModelStepResult | null;
  toolDispatch: unknown | null;
  evidenceId: string | null;
  stopped: boolean;
  stopReason: string | null;
};

export type AgentLoopResult = {
  ok: boolean;
  executionId: string;
  iterations: number;
  evidenceIds: string[];
  finalStatus: ExecutionStatus | null;
  stopReason: string;
  error?: string;
  details?: LoopIterationResult[];
};

type ToolResultMessage = {
  role: "user";
  content: string;
  source: "tool_result";
};

function toolResultToMessage(
  toolName: string,
  result: unknown,
  isError: boolean
): ToolResultMessage {
  if (isError) {
    const errorResult = result as { error: string };
    return {
      role: "user",
      content: `Tool ${toolName} error: ${errorResult.error || "unknown error"}`,
      source: "tool_result",
    };
  }

  const successResult = result as { ok: boolean; output: string; tool: string };
  return {
    role: "user",
    content: `Tool ${toolName} result: ${successResult.output || "(empty)"}`,
    source: "tool_result",
  };
}

async function isExecutionRecoverable(
  executionId: string,
  userId: string
): Promise<boolean> {
  const execution = await getOwnedExecution(executionId, userId);
  if (!execution) return false;
  const status = execution.status as ExecutionStatus;
  return RECOVERABLE.has(status);
}

function hasToolProposal(modelResult: ModelStepResult): boolean {
  return modelResult.toolProposal !== null;
}

function isIdempotentToolDispatch(toolDispatch: unknown): boolean {
  const dispatch = toolDispatch as { idempotent?: boolean };
  return dispatch?.idempotent === true;
}

function getToolDispatchError(toolDispatch: unknown): string | null {
  if (!toolDispatch || typeof toolDispatch !== "object") return null;
  const dispatch = toolDispatch as {
    error?: unknown;
    result?: { ok?: unknown; error?: unknown };
  };
  if (typeof dispatch.error === "string") return dispatch.error;
  if (dispatch.result?.ok === false) {
    return typeof dispatch.result.error === "string"
      ? dispatch.result.error
      : "tool failed";
  }
  return null;
}

/** H6 — assinatura estável da proposta de tool (nome + input). */
function toolSignature(modelResult: ModelStepResult): string | null {
  const proposal = modelResult.toolProposal as
    | { name?: string; input?: unknown }
    | null
    | undefined;
  if (!proposal?.name) return null;
  const raw =
    typeof proposal.input === "string" ? proposal.input : JSON.stringify(proposal.input ?? "");
  return `${proposal.name}::${raw}`;
}

/** H6 — assinatura do resultado entregue ao modelo. */
function dispatchOutputSignature(toolDispatch: unknown): string | null {
  if (!toolDispatch || typeof toolDispatch !== "object") return null;
  const dispatch = toolDispatch as {
    result?: { ok?: boolean; output?: string; error?: string };
  };
  const r = dispatch.result;
  if (!r) return null;
  const body = r.ok ? r.output ?? "" : r.error ?? "";
  return `${r.ok ? "ok" : "err"}::${body.slice(0, 400)}`;
}

/** H6 — lê o orçamento acumulado já gasto por esta execution. */
function readIterationsUsed(checkpoint: unknown): number {
  if (!checkpoint || typeof checkpoint !== "object") return 0;
  const value = (checkpoint as { iterationsUsed?: unknown }).iterationsUsed;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Soma apenas contadores numéricos confiáveis; provedores locais podem omitir usage. */
export function modelUsageTokens(modelResult: ModelStepResult): number {
  const prompt = modelResult.usage?.promptTokens;
  const completion = modelResult.usage?.completionTokens;
  const total =
    (typeof prompt === "number" && Number.isFinite(prompt) && prompt > 0 ? prompt : 0) +
    (typeof completion === "number" && Number.isFinite(completion) && completion > 0 ? completion : 0);
  return Math.floor(total);
}

function readTokensUsed(checkpoint: unknown): number {
  if (!checkpoint || typeof checkpoint !== "object") return 0;
  const value = (checkpoint as { tokensUsed?: unknown }).tokensUsed;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export async function runAgentLoop(
  executionId: string,
  userId: string,
  maxIterations: number = MAX_ITERATIONS
): Promise<AgentLoopResult> {
  const evidenceIds: string[] = [];
  const details: LoopIterationResult[] = [];

  const config = getModelConfig();
  if (!config) {
    return {
      ok: false,
      executionId,
      iterations: 0,
      evidenceIds: [],
      finalStatus: null,
      stopReason: "MODEL_NOT_CONFIGURED",
      error: "MODEL_API_KEY não configurado",
      details,
    };
  }

  const execution = await getOwnedExecution(executionId, userId);
  if (!execution) {
    return {
      ok: false,
      executionId,
      iterations: 0,
      evidenceIds: [],
      finalStatus: null,
      stopReason: "NOT_FOUND",
      error: "Execution não encontrada ou não pertence ao usuário",
      details,
    };
  }

  const initialStatus = execution.status as ExecutionStatus;
  if (!RECOVERABLE.has(initialStatus)) {
    return {
      ok: false,
      executionId,
      iterations: 0,
      evidenceIds: [],
      finalStatus: initialStatus,
      stopReason: "TERMINAL_STATE",
      error: `Execution está em estado terminal: ${initialStatus}`,
      details,
    };
  }

  // H6 — orçamento acumulado entre retomadas.
  const usedBefore = readIterationsUsed(execution.checkpoint);
  let totalUsed = usedBefore;
  if (usedBefore >= MAX_TOTAL_ITERATIONS) {
    return {
      ok: false,
      executionId,
      iterations: 0,
      evidenceIds: [],
      finalStatus: initialStatus,
      stopReason: "ITERATION_BUDGET_EXCEEDED",
      error: `Orçamento acumulado de iterações esgotado (${usedBefore}/${MAX_TOTAL_ITERATIONS}).`,
      details,
    };
  }

  const tokensUsedBefore = readTokensUsed(execution.checkpoint);
  let totalTokens = tokensUsedBefore;
  if (tokensUsedBefore >= MAX_TOTAL_TOKENS) {
    return {
      ok: false,
      executionId,
      iterations: 0,
      evidenceIds: [],
      finalStatus: initialStatus,
      stopReason: "TOKEN_BUDGET_EXCEEDED",
      error: `Orçamento acumulado de tokens esgotado (${tokensUsedBefore}/${MAX_TOTAL_TOKENS}).`,
      details,
    };
  }

  const effectiveMax = Math.min(
    Math.max(1, maxIterations),
    MAX_TOTAL_ITERATIONS - usedBefore
  );
  const startedAt = Date.now();

  let iteration = 0;
  let stopReason: string | null = null;
  const toolContextMessages: ModelMessage[] = [];

  const seenSignatures = new Set<string>();
  let lastOutputSignature: string | null = null;
  let identicalOutputs = 0;

  while (iteration < effectiveMax && !stopReason) {
    // H6 — teto de tempo de parede.
    if (Date.now() - startedAt > MAX_LOOP_DURATION_MS) {
      stopReason = "TIME_BUDGET_EXCEEDED";
      break;
    }
    if (totalTokens >= MAX_TOTAL_TOKENS) {
      stopReason = "TOKEN_BUDGET_EXCEEDED";
      break;
    }

    iteration++;

    const stillRecoverable = await isExecutionRecoverable(executionId, userId);
    if (!stillRecoverable) {
      const currentExec = await getOwnedExecution(executionId, userId);
      const currentStatus = currentExec?.status as ExecutionStatus;
      stopReason = `EXECUTION_NOT_RECOVERABLE: ${currentStatus || "unknown"}`;
      break;
    }

    const stepResult = await runModelStep(executionId, userId, toolContextMessages);

    if ("error" in stepResult) {
      details.push({
        iteration,
        modelResult: null,
        toolDispatch: null,
        evidenceId: null,
        stopped: true,
        stopReason: `MODEL_STEP_ERROR: ${stepResult.error}`,
      });

      stopReason = `MODEL_STEP_ERROR: ${stepResult.error}`;
      const errEvidence = (stepResult as { evidence?: { id?: string } }).evidence;
      if (errEvidence?.id) {
        evidenceIds.push(errEvidence.id);
      }
      break;
    }

    const okEvidence = (stepResult as { evidence?: { id?: string } }).evidence;
    if (okEvidence?.id) {
      evidenceIds.push(okEvidence.id);
    }

    const hasProposal = hasToolProposal(stepResult.model);

    // A chamada que excede o teto é registrada como evidência, mas não dispara
    // a próxima tool. Isso impede que um modelo caro continue gastando tokens.
    totalTokens += modelUsageTokens(stepResult.model);
    if (totalTokens > MAX_TOTAL_TOKENS) {
      stopReason = "TOKEN_BUDGET_EXCEEDED";
      details.push({
        iteration,
        modelResult: stepResult.model,
        toolDispatch: null,
        evidenceId: stepResult.evidence?.id || null,
        stopped: true,
        stopReason,
      });
      break;
    }

    if (!hasProposal) {
      stopReason = "NO_TOOL_PROPOSAL";
      details.push({
        iteration,
        modelResult: stepResult.model,
        toolDispatch: null,
        evidenceId: stepResult.evidence?.id || null,
        stopped: true,
        stopReason,
      });
      break;
    }

    // H6 — mesma proposta repetida (tool+input) → sem progresso.
    const signature = toolSignature(stepResult.model);
    if (signature && seenSignatures.has(signature)) {
      stopReason = "REPEATED_TOOL_CALL";
      details.push({
        iteration,
        modelResult: stepResult.model,
        toolDispatch: null,
        evidenceId: stepResult.evidence?.id || null,
        stopped: true,
        stopReason,
      });
      break;
    }
    if (signature) seenSignatures.add(signature);

    const toolDispatch = await stepResult.toolDispatch;

    if (toolDispatch && isIdempotentToolDispatch(toolDispatch)) {
      stopReason = "IDEMPOTENT_TOOL_CALL";
      details.push({
        iteration,
        modelResult: stepResult.model,
        toolDispatch,
        evidenceId: (toolDispatch as { evidenceId?: string }).evidenceId || null,
        stopped: true,
        stopReason,
      });
      break;
    }

    if (toolDispatch && typeof toolDispatch === "object" && "evidence" in toolDispatch) {
      const dispatch = toolDispatch as { evidence?: { id: string } };
      if (dispatch.evidence?.id) {
        evidenceIds.push(dispatch.evidence.id);
      }
    }

    const toolError = getToolDispatchError(toolDispatch);
    if (toolError) {
      toolContextMessages.push(
        toolResultToMessage(
          stepResult.model.toolProposal?.name || "unknown",
          { error: toolError },
          true
        )
      );
      stopReason = `TOOL_ERROR: ${toolError}`;
      details.push({
        iteration,
        modelResult: stepResult.model,
        toolDispatch,
        evidenceId: (toolDispatch as { evidenceId?: string }).evidenceId || null,
        stopped: true,
        stopReason,
      });
      break;
    }

    // H6 — mesmo output repetido N vezes → sem progresso real.
    const outputSignature = dispatchOutputSignature(toolDispatch);
    if (outputSignature && outputSignature === lastOutputSignature) {
      identicalOutputs++;
      if (identicalOutputs >= MAX_IDENTICAL_OUTPUTS) {
        stopReason = "NO_PROGRESS";
        details.push({
          iteration,
          modelResult: stepResult.model,
          toolDispatch,
          evidenceId: (toolDispatch as { evidenceId?: string }).evidenceId || null,
          stopped: true,
          stopReason,
        });
        break;
      }
    } else {
      identicalOutputs = 0;
      lastOutputSignature = outputSignature;
    }

    if (toolDispatch && stepResult.model.toolProposal) {
      toolContextMessages.push(
        toolResultToMessage(stepResult.model.toolProposal.name, toolDispatch, false)
      );
    }

    details.push({
      iteration,
      modelResult: stepResult.model,
      toolDispatch,
      evidenceId: stepResult.evidence?.id || null,
      stopped: false,
      stopReason: null,
    });
  }

  totalUsed += iteration;

  // H6 — persiste o consumo acumulado (sobrevive a retomadas).
  let checkpointPersisted = true;
  try {
    const checkpointResult = await writeCheckpoint(executionId, userId, {
      iterationsUsed: totalUsed,
      tokensUsed: totalTokens,
    });
    if ("error" in checkpointResult) {
      throw new Error(`CHECKPOINT_${checkpointResult.error}`);
    }
  } catch (e) {
    checkpointPersisted = false;
    console.error(
      "[agent-loop] falha ao persistir orçamento acumulado",
      e instanceof Error ? e.message : String(e)
    );
    try {
      await completeExecution(
        executionId,
        userId,
        "FAILED",
        "BUDGET_PERSISTENCE_FAILED: orçamento do agent loop não pôde ser persistido"
      );
    } catch (markFailedError) {
      console.error(
        "[agent-loop] não foi possível marcar execução como FAILED",
        markFailedError instanceof Error ? markFailedError.message : String(markFailedError)
      );
    }
  }

  const finalExec = await getOwnedExecution(executionId, userId);
  const finalStatus = finalExec?.status as ExecutionStatus;

  return {
    ok: checkpointPersisted && (!stopReason || SOFT_STOP_REASONS.some((r) => stopReason!.startsWith(r))),
    executionId,
    iterations: iteration,
    evidenceIds,
    finalStatus,
    stopReason: checkpointPersisted ? (stopReason || "MAX_ITERATIONS_REACHED") : "BUDGET_PERSISTENCE_FAILED",
    details,
  };
}
