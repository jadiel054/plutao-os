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
 * - MAX_ITERATIONS: limite de iterações por chamada (default: 10)
 * - Idempotência: reaproveita hash do dispatchTool()
 * - Verifica status da execution a cada iteração
 * - Não faz retry automático em erros
 */

import { getOwnedExecution } from "./service";
import { RECOVERABLE, type ExecutionStatus } from "./types";
import { runModelStep } from "./model/step";
import { getModelConfig } from "./model/config";
import type { ModelMessage, ModelStepResult } from "./model/types";

// Limite de iterações para prevenir loop infinito
export const MAX_ITERATIONS = 10;

// Tipo para resultado de uma iteração do loop
export type LoopIterationResult = {
  iteration: number;
  modelResult: ModelStepResult | null;
  toolDispatch: unknown | null;
  evidenceId: string | null;
  stopped: boolean;
  stopReason: string | null;
};

// Tipo para resultado final do loop
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

// Tipos para mensagens de contexto de tool results
type ToolResultMessage = {
  role: "user";
  content: string;
  source: "tool_result";
};

/**
 * Converte resultado de tool para mensagem de contexto
 * Formato: "Tool <name> result: <output>" ou "Tool <name> error: <error>"
 */
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

/**
 * Verifica se a execution ainda está em estado recuperável
 */
async function isExecutionRecoverable(
  executionId: string,
  userId: string
): Promise<boolean> {
  const execution = await getOwnedExecution(executionId, userId);
  if (!execution) return false;
  const status = execution.status as ExecutionStatus;
  return RECOVERABLE.has(status);
}

/**
 * Verifica se o modelo propôs uma tool
 */
function hasToolProposal(modelResult: ModelStepResult): boolean {
  return modelResult.toolProposal !== null;
}

/**
 * Verifica se dispatchTool retornou idempotente
 */
function isIdempotentToolDispatch(toolDispatch: unknown): boolean {
  const dispatch = toolDispatch as { idempotent?: boolean };
  return dispatch?.idempotent === true;
}

/**
 * Agent Loop Controller
 * 
 * Executa loop automático: Model → Tool → Result → Model
 * 
 * @param executionId - ID da execution
 * @param userId - ID do usuário (para ownership)
 * @param maxIterations - Limite de iterações (default: MAX_ITERATIONS)
 * @returns Resultado do loop com detalhes
 */
export async function runAgentLoop(
  executionId: string,
  userId: string,
  maxIterations: number = MAX_ITERATIONS
): Promise<AgentLoopResult> {
  const evidenceIds: string[] = [];
  const details: LoopIterationResult[] = [];
  
  // Verifica se model provider está configurado
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

  // Verifica se execution existe e está em estado válido
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

  // Loop principal
  let iteration = 0;
  let stopReason: string | null = null;
  const toolContextMessages: ModelMessage[] = [];

  while (iteration < maxIterations && !stopReason) {
    iteration++;
    
    // Verifica se execution ainda está recuperável (pode ter sido pausada externamente)
    const stillRecoverable = await isExecutionRecoverable(executionId, userId);
    if (!stillRecoverable) {
      const currentExec = await getOwnedExecution(executionId, userId);
      const currentStatus = currentExec?.status as ExecutionStatus;
      stopReason = `EXECUTION_NOT_RECOVERABLE: ${currentStatus || "unknown"}`;
      break;
    }

    // Chama model step com contexto de tool results anteriores
    const stepResult = await runModelStep(executionId, userId, toolContextMessages);
    
    // Processa resultado
    if ("error" in stepResult) {
      // Erro no model step
      details.push({
        iteration,
        modelResult: null,
        toolDispatch: null,
        evidenceId: null,
        stopped: true,
        stopReason: `MODEL_STEP_ERROR: ${stepResult.error}`,
      });
      
      stopReason = `MODEL_STEP_ERROR: ${stepResult.error}`;
      if (stepResult.evidence?.id) {
        evidenceIds.push(stepResult.evidence.id);
      }
      break;
    }

    // Adiciona evidenceId do model step
    if (stepResult.evidence?.id) {
      evidenceIds.push(stepResult.evidence.id);
    }

    // Verifica se modelo propôs tool
    const hasProposal = hasToolProposal(stepResult.model);
    
    if (!hasProposal) {
      // Critério de parada: modelo não propôs tool (concluiu)
      // DECISSÃO: Deixar execution em RUNNING, não marcar como COMPLETED
      // Justificativa: O modelo pode querer continuar em um próximo trigger manual
      // ou o usuário pode querer intervir. Marcar como COMPLETED automaticamente
      // poderia perder a capacidade de continuar o fluxo manualmente.
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

    // Executa tool via dispatch
    const toolDispatch = await stepResult.toolDispatch;
    
    // Verifica se tool dispatch foi idempotente (possível loop)
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

    // Adiciona evidenceId da tool
    if (toolDispatch && typeof toolDispatch === "object" && "evidence" in toolDispatch) {
      const dispatch = toolDispatch as { evidence?: { id: string } };
      if (dispatch.evidence?.id) {
        evidenceIds.push(dispatch.evidence.id);
      }
    }

    // Verifica se tool dispatch retornou erro
    if (toolDispatch && typeof toolDispatch === "object" && "error" in toolDispatch) {
      const dispatch = toolDispatch as { error: string };
      
      // Adiciona mensagem de contexto com o erro da tool
      toolContextMessages.push(
        toolResultToMessage(
          stepResult.model.toolProposal?.name || "unknown",
          toolDispatch,
          true
        )
      );
      
      stopReason = `TOOL_ERROR: ${dispatch.error}`;
      
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

    // Tool executada com sucesso - adiciona resultado como contexto
    if (toolDispatch && stepResult.model.toolProposal) {
      toolContextMessages.push(
        toolResultToMessage(
          stepResult.model.toolProposal.name,
          toolDispatch,
          false
        )
      );
    }

    // Registra iteração
    details.push({
      iteration,
      modelResult: stepResult.model,
      toolDispatch,
      evidenceId: stepResult.evidence?.id || null,
      stopped: false,
      stopReason: null,
    });
  }

  // Verifica status final da execution
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
