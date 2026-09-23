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
