/**
 * Agent Loop Controller V1
 *
 * Implementa o loop automático: Model → Tool → Result → Model
 *
 * Fluxo:
 * 1. Chama runModelStep() para obter resposta do modelo
 * 2. Se modelo propôs tool, executa via dispatchTool()
 * 3. Injeta resultado da tool como mensagem de contexto
 * 4. Repite até critério de parada
 *
 * Proteções:
 * - MAX_ITERATIONS: limite de iterações por chamada (default: 20)
 * - Idempotência: reaproveita hash do dispatchTool()
 * - Verifica status da execution a cada iteração
 * - Não faz retry automático em erros
 */

import { getOwnedExecution } from "./service";
import { RECOVERABLE, type ExecutionStatus } from "./types";
import { runModelStep } from "./model/step";
import { getModelConfig } from "./model/config";
import type { ModelMessage, ModelStepResult } from "./model/types";

// Limite de iterações para prevenir loop infinito (missões multi-arquivo)
export const MAX_ITERATIONS = 20;

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

  let iteration = 0;
  let stopReason: string | null = null;
  const toolContextMessages: ModelMessage[] = [];

  while (iteration < maxIterations && !stopReason) {
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

  const finalExec = await getOwnedExecution(executionId, userId);
  const finalStatus = finalExec?.status as ExecutionStatus;

  return {
    ok: !stopReason || stopReason.startsWith("NO_TOOL_PROPOSAL"),
    executionId,
    iterations: iteration,
    evidenceIds,
    finalStatus,
    stopReason: stopReason || "MAX_ITERATIONS_REACHED",
    details,
  };
}
