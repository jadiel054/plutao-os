/**
 * Agent Loop Controller V1
 * 
 * Implementa o loop automático: Model → Tool → Result → Model
 * 
 * Fluxo:
 * 1. Recebe um objetivo inicial (initialGoal)
 * 2. Chama o modelo com o contexto atual
 * 3. Se o modelo propuser uma tool, executa a tool
 * 4. Injeta o resultado da tool como mensagem de contexto
 * 5. Repite até critério de parada ou limite de iterações
 * 
 * Proteções:
 * - MAX_ITERATIONS: limite de iterações por chamada (default: 8, min: 5, max: 15)
 * - Idempotência: evita loops infinitos com mesmas chamadas
 * - Controle de estado: rastreia todas as iterações e mensagens
 */

// ============================================================
// Types
// ============================================================

/**
 * Estado do Agent Loop
 */
export interface AgentLoopState {
  /** Mensagens acumuladas no contexto */
  messages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    source?: string;
  }>;
  /** Número de iterações executadas */
  iterations: number;
  /** Limite máximo de iterações */
  maxIterations: number;
  /** Indica se o loop foi concluído */
  isComplete: boolean;
  /** Motivo da parada */
  stopReason: string | null;
  /** IDs de evidências geradas */
  evidenceIds: string[];
}

/**
 * Resultado de uma iteração do loop
 */
export interface LoopIterationResult {
  iteration: number;
  modelInput: string;
  modelOutput: string;
  toolCalled: string | null;
  toolInput: string | null;
  toolOutput: unknown;
  toolError: string | null;
  evidenceId: string | null;
  stopped: boolean;
  stopReason: string | null;
}

/**
 * Resultado final do Agent Loop
 */
export interface AgentLoopResult {
  ok: boolean;
  state: AgentLoopState;
  iterations: LoopIterationResult[];
  finalOutput: string;
  error?: string;
}

/**
 * Interface para o provider de modelo
 * (Abstração para permitir diferentes implementações)
 */
export interface ModelProvider {
  /**
   * Chama o modelo com as mensagens de contexto
   */
  callModel(messages: Array<{ role: string; content: string }>): Promise<{
    ok: boolean;
    output: string;
    toolProposal?: { name: string; input: string } | null;
    evidenceId?: string;
    error?: string;
  }>;
}

/**
 * Interface para o dispatcher de tools
 */
export interface ToolDispatcher {
  /**
   * Executa uma tool com input específico
   */
  dispatchTool(name: string, input: string, executionId: string): Promise<{
    ok: boolean;
    output: unknown;
    evidenceId?: string;
    error?: string;
    idempotent?: boolean;
  }>;
}

// ============================================================
// Constants
// ============================================================

/** Limite mínimo de iterações */
export const MIN_ITERATIONS = 5;

/** Limite máximo de iterações */
export const MAX_ITERATIONS = 15;

/** Limite padrão de iterações */
export const DEFAULT_ITERATIONS = 8;

// ============================================================
// Agent Loop Controller
// ============================================================

/**
 * Cria o estado inicial do Agent Loop
 */
export function createInitialState(
  initialGoal: string,
  maxIterations: number = DEFAULT_ITERATIONS
): AgentLoopState {
  // Validar limites
  const validatedMaxIterations = Math.min(
    Math.max(maxIterations, MIN_ITERATIONS),
    MAX_ITERATIONS
  );

  return {
    messages: [
      {
        role: "user",
        content: initialGoal,
        source: "initial_goal",
      },
    ],
    iterations: 0,
    maxIterations: validatedMaxIterations,
    isComplete: false,
    stopReason: null,
    evidenceIds: [],
  };
}

/**
 * Verifica se uma tool deve ser executada
 */
function shouldExecuteTool(toolProposal: { name: string; input: string } | null | undefined): boolean {
  return !!toolProposal && typeof toolProposal === "object" && !!toolProposal.name;
}

/**
 * Adiciona uma mensagem de tool result ao contexto
 */
function addToolResultMessage(
  state: AgentLoopState,
  toolName: string,
  toolOutput: unknown,
  isError: boolean = false
): void {
  let content: string;
  
  if (isError) {
    const errorResult = toolOutput as { error?: string };
    content = `Tool ${toolName} error: ${errorResult.error || "unknown error"}`;
  } else {
    const successResult = toolOutput as { output?: string };
    content = `Tool ${toolName} result: ${successResult.output || "(empty)"}`;
  }

  state.messages.push({
    role: "tool",
    content,
    source: "tool_result",
  });
}

/**
 * Executa o Agent Loop completo
 * 
 * @param initialGoal - Objetivo inicial para o agente
 * @param modelProvider - Provider de modelo para chamadas
 * @param toolDispatcher - Dispatcher de tools para execução
 * @param maxIterations - Limite máximo de iterações (default: DEFAULT_ITERATIONS)
 * @returns Resultado final do loop
 */
export async function runAgentLoop(
  initialGoal: string,
  modelProvider: ModelProvider,
  toolDispatcher: ToolDispatcher,
  executionId: string,
  maxIterations: number = DEFAULT_ITERATIONS
): Promise<AgentLoopResult> {
  const state = createInitialState(initialGoal, maxIterations);
  const iterations: LoopIterationResult[] = [];

  try {
    while (state.iterations < state.maxIterations && !state.isComplete) {
      state.iterations++;
      const currentIteration = state.iterations;

      // Chama o modelo com o contexto atual
      const modelResult = await modelProvider.callModel(
        state.messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))
      );

      // Processa o resultado do modelo
      if (!modelResult.ok || modelResult.error) {
        const iterationResult: LoopIterationResult = {
          iteration: currentIteration,
          modelInput: state.messages[state.messages.length - 1]?.content || "",
          modelOutput: modelResult.error || "",
          toolCalled: null,
          toolInput: null,
          toolOutput: null,
          toolError: modelResult.error || null,
          evidenceId: modelResult.evidenceId || null,
          stopped: true,
          stopReason: `MODEL_ERROR: ${modelResult.error}`,
        };

        iterations.push(iterationResult);
        state.isComplete = true;
        state.stopReason = iterationResult.stopReason;

        if (modelResult.evidenceId) {
          state.evidenceIds.push(modelResult.evidenceId);
        }

        break;
      }

      // Adiciona a resposta do modelo ao contexto
      state.messages.push({
        role: "assistant",
        content: modelResult.output,
        source: "model_output",
      });

      if (modelResult.evidenceId) {
        state.evidenceIds.push(modelResult.evidenceId);
      }

      // Verifica se o modelo propôs uma tool
      const toolProposal = modelResult.toolProposal;
      const shouldExecute = shouldExecuteTool(toolProposal);

      if (!shouldExecute) {
        // Critério de parada: modelo não propôs tool (objetivo alcançado)
        const iterationResult: LoopIterationResult = {
          iteration: currentIteration,
          modelInput: state.messages[state.messages.length - 2]?.content || "",
          modelOutput: modelResult.output,
          toolCalled: null,
          toolInput: null,
          toolOutput: null,
          toolError: null,
          evidenceId: modelResult.evidenceId || null,
          stopped: true,
          stopReason: "NO_TOOL_PROPOSAL",
        };

        iterations.push(iterationResult);
        state.isComplete = true;
        state.stopReason = "NO_TOOL_PROPOSAL";

        break;
      }

      // Executa a tool proposta
      const toolName = toolProposal!.name;
      const toolInput = toolProposal!.input;

      const toolResult = await toolDispatcher.dispatchTool(
        toolName,
        toolInput,
        executionId
      );

      // Processa o resultado da tool
      if (toolResult.idempotent) {
        // Tool já executada, evitar loop infinito
        const iterationResult: LoopIterationResult = {
          iteration: currentIteration,
          modelInput: state.messages[state.messages.length - 2]?.content || "",
          modelOutput: modelResult.output,
          toolCalled: toolName,
          toolInput: toolInput,
          toolOutput: toolResult.output,
          toolError: null,
          evidenceId: toolResult.evidenceId || null,
          stopped: true,
          stopReason: "IDEMPOTENT_TOOL_CALL",
        };

        iterations.push(iterationResult);
        state.isComplete = true;
        state.stopReason = "IDEMPOTENT_TOOL_CALL";

        if (toolResult.evidenceId) {
          state.evidenceIds.push(toolResult.evidenceId);
        }

        break;
      }

      if (!toolResult.ok || toolResult.error) {
        // Erro na execução da tool
        addToolResultMessage(state, toolName, toolResult, true);

        const iterationResult: LoopIterationResult = {
          iteration: currentIteration,
          modelInput: state.messages[state.messages.length - 2]?.content || "",
          modelOutput: modelResult.output,
          toolCalled: toolName,
          toolInput: toolInput,
          toolOutput: toolResult.output,
          toolError: toolResult.error || null,
          evidenceId: toolResult.evidenceId || null,
          stopped: true,
          stopReason: `TOOL_ERROR: ${toolResult.error}`,
        };

        iterations.push(iterationResult);
        state.isComplete = true;
        state.stopReason = iterationResult.stopReason;

        if (toolResult.evidenceId) {
          state.evidenceIds.push(toolResult.evidenceId);
        }

        break;
      }

      // Tool executada com sucesso - adiciona resultado ao contexto
      addToolResultMessage(state, toolName, toolResult.output);

      if (toolResult.evidenceId) {
        state.evidenceIds.push(toolResult.evidenceId);
      }

      // Registra a iteração
      const iterationResult: LoopIterationResult = {
        iteration: currentIteration,
        modelInput: state.messages[state.messages.length - 2]?.content || "",
        modelOutput: modelResult.output,
        toolCalled: toolName,
        toolInput: toolInput,
        toolOutput: toolResult.output,
        toolError: null,
        evidenceId: toolResult.evidenceId || null,
        stopped: false,
        stopReason: null,
      };

      iterations.push(iterationResult);
    }

    // Verifica se o loop foi concluído com sucesso
    if (state.stopReason === "NO_TOOL_PROPOSAL") {
      return {
        ok: true,
        state,
        iterations,
        finalOutput: state.messages[state.messages.length - 1]?.content || "",
      };
    }

    // Loop concluído por limite de iterações
    if (state.iterations >= state.maxIterations) {
      state.isComplete = true;
      state.stopReason = "MAX_ITERATIONS_REACHED";
    }

    return {
      ok: state.stopReason === "NO_TOOL_PROPOSAL",
      state,
      iterations,
      finalOutput: state.messages[state.messages.length - 1]?.content || "",
      error: state.stopReason || undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return {
      ok: false,
      state: {
        ...state,
        isComplete: true,
        stopReason: `INTERNAL_ERROR: ${errorMessage}`,
      },
      iterations,
      finalOutput: "",
      error: errorMessage,
    };
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Formata o estado do loop para logging
 */
export function formatLoopState(state: AgentLoopState): string {
  return JSON.stringify({
    iterations: state.iterations,
    maxIterations: state.maxIterations,
    isComplete: state.isComplete,
    stopReason: state.stopReason,
    evidenceCount: state.evidenceIds.length,
    messageCount: state.messages.length,
  }, null, 2);
}

/**
 * Formata o resultado do loop para resposta
 */
export function formatLoopResult(result: AgentLoopResult): string {
  return JSON.stringify({
    ok: result.ok,
    iterations: result.iterations.length,
    finalOutput: result.finalOutput.substring(0, 200) + (result.finalOutput.length > 200 ? "..." : ""),
    error: result.error,
    stopReason: result.state.stopReason,
  }, null, 2);
}
