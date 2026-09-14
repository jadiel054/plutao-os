/**
 * Checkpoint Service - Persistência de Checkpoints no Banco de Dados
 *
 * Responsável por:
 * - Salvar checkpoints a cada passo do Agent Loop
 * - Restaurar checkpoints ao recarregar PWA
 * - Garantir continuidade da missão
 *
 * Integração com:
 * - packages/db/src/schema.ts (tabela executions.checkpoint)
 * - Agent Loop (packages/domain/src/runtime/agentLoop.ts)
 * - Model Step (apps/web/src/lib/runtime/model/step.ts)
 */

import { and, desc, eq } from "drizzle-orm";
import { executions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getOwnedExecution } from "./service";
import { RECOVERABLE, type ExecutionStatus } from "./types";

// ============================================================
// Types
// ============================================================

/** Formato do checkpoint armazenado no banco */
export interface CheckpointData {
  /** Passo atual da execução */
  step?: string;

  /** Índice da iteração */
  stepIndex?: number;

  /** ID da task atual */
  taskId?: string | null;

  /** Notação/observação do passo */
  note?: string;

  /** ID da última evidence gerada */
  evidenceId?: string;

  /** IDs das tasks concluídas */
  completedTaskIds?: string[];

  /** Histórico de tool calls */
  toolCalls?: string[];

  /** Último modelo usado */
  lastModel?: {
    provider: string;
    model: string;
    evidenceId: string;
  };

  /** Modo de modelo ativo (auto/online/offline) */
  modelMode?: "auto" | "online" | "offline";

  /** ID do modelo local (se aplicável) */
  localModelId?: string;

  /** Status de carregamento do modelo local */
  localModelStatus?: "idle" | "loading" | "loaded" | "error";
}

/** Resultado da operação de checkpoint */
export interface CheckpointResult {
  ok: boolean;
  checkpoint?: CheckpointData;
  checkpointAt?: string;
  error?: string;
}

// ============================================================
// Checkpoint Service
// ============================================================

/**
 * Salva um checkpoint no banco de dados
 */
export async function saveCheckpoint(
  executionId: string,
  userId: string,
  data: CheckpointData
): Promise<CheckpointResult> {
  const execution = await getOwnedExecution(executionId, userId);

  if (!execution) {
    return {
      ok: false,
      error: "EXECUTION_NOT_FOUND",
    };
  }

  const status = execution.status as ExecutionStatus;

  // Não permite salvar checkpoint em execuções terminais
  if (!RECOVERABLE.has(status) && status !== "PENDING") {
    return {
      ok: false,
      error: `CANNOT_SAVE_CHECKPOINT_IN_TERMINAL_STATE: ${status}`,
    };
  }

  try {
    const now = new Date();
    const db = getDb();

    const existingCheckpoint = execution.checkpoint as CheckpointData | null;
    const mergedCheckpoint: CheckpointData = {
      ...(existingCheckpoint || {}),
      ...data,
      stepIndex: data.stepIndex ?? existingCheckpoint?.stepIndex ?? 0,
    };

    await db
      .update(executions)
      .set({
        checkpoint: mergedCheckpoint,
        checkpointAt: now,
        currentTaskId: data.taskId !== undefined ? data.taskId : execution.currentTaskId,
        updatedAt: now,
      })
      .where(eq(executions.id, executionId))
      .returning();

    return {
      ok: true,
      checkpoint: mergedCheckpoint,
      checkpointAt: now.toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[saveCheckpoint]", errorMessage);

    return {
      ok: false,
      error: `FAILED_TO_SAVE_CHECKPOINT: ${errorMessage}`,
    };
  }
}

/**
 * Restaura o checkpoint de uma execução
 */
export async function restoreCheckpoint(
  executionId: string,
  userId: string
): Promise<CheckpointResult> {
  const execution = await getOwnedExecution(executionId, userId);

  if (!execution) {
    return {
      ok: false,
      error: "EXECUTION_NOT_FOUND",
    };
  }

  const checkpoint = execution.checkpoint as CheckpointData | null;
  const checkpointAt = execution.checkpointAt;

  if (!checkpoint || Object.keys(checkpoint).length === 0) {
    return {
      ok: true,
      checkpoint: {},
      checkpointAt: undefined,
    };
  }

  return {
    ok: true,
    checkpoint,
    checkpointAt: checkpointAt?.toISOString(),
  };
}

/**
 * Obtém o último checkpoint de uma missão (com ownership por userId)
 */
export async function getLastCheckpoint(
  missionId: string,
  userId: string
): Promise<CheckpointResult> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        checkpoint: executions.checkpoint,
        checkpointAt: executions.checkpointAt,
      })
      .from(executions)
      .where(and(eq(executions.missionId, missionId), eq(executions.userId, userId)))
      .orderBy(desc(executions.checkpointAt))
      .limit(1);

    if (!rows[0] || !rows[0].checkpoint) {
      return {
        ok: true,
        checkpoint: {},
        checkpointAt: undefined,
      };
    }

    return {
      ok: true,
      checkpoint: rows[0].checkpoint as CheckpointData,
      checkpointAt: rows[0].checkpointAt?.toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[getLastCheckpoint]", errorMessage);

    return {
      ok: false,
      error: `FAILED_TO_RESTORE_CHECKPOINT: ${errorMessage}`,
    };
  }
}

/**
 * Verifica se uma execução tem checkpoint válido
 */
export async function hasValidCheckpoint(
  executionId: string,
  userId: string
): Promise<boolean> {
  const result = await restoreCheckpoint(executionId, userId);
  return Boolean(result.ok && result.checkpoint && Object.keys(result.checkpoint).length > 0);
}

/**
 * Limpa o checkpoint de uma execução (útil ao reiniciar)
 */
export async function clearCheckpoint(
  executionId: string,
  userId: string
): Promise<CheckpointResult> {
  const execution = await getOwnedExecution(executionId, userId);

  if (!execution) {
    return {
      ok: false,
      error: "EXECUTION_NOT_FOUND",
    };
  }

  try {
    const db = getDb();
    await db
      .update(executions)
      .set({
        checkpoint: {},
        checkpointAt: null,
        updatedAt: new Date(),
      })
      .where(eq(executions.id, executionId));

    return {
      ok: true,
      checkpoint: {},
      checkpointAt: undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return {
      ok: false,
      error: `FAILED_TO_CLEAR_CHECKPOINT: ${errorMessage}`,
    };
  }
}

// ============================================================
// Factory para criar checkpoint a partir do estado do Agent Loop
// ============================================================

export function createCheckpointFromLoopState(
  state: {
    messages: Array<{ role: string; content: string; source?: string }>;
    iterations: number;
    evidenceIds: string[];
    stopReason: string | null;
    isComplete: boolean;
  },
  modelInfo: {
    provider: string;
    model: string;
    evidenceId?: string;
    mode?: "auto" | "online" | "offline";
    localModelId?: string;
    localModelStatus?: string;
  }
): CheckpointData {
  const lastModel = modelInfo.evidenceId
    ? {
        provider: modelInfo.provider,
        model: modelInfo.model,
        evidenceId: modelInfo.evidenceId,
      }
    : undefined;

  return {
    step: "model_step",
    stepIndex: state.iterations,
    note: state.stopReason || "Running",
    evidenceId: state.evidenceIds[state.evidenceIds.length - 1],
    completedTaskIds: [],
    toolCalls: [],
    lastModel,
    modelMode: modelInfo.mode,
    localModelId: modelInfo.localModelId,
    localModelStatus: modelInfo.localModelStatus as
      | "idle"
      | "loading"
      | "loaded"
      | "error"
      | undefined,
  };
}

export function updateCheckpointWithTool(
  checkpoint: CheckpointData,
  toolInfo: {
    toolName: string;
    toolInput: string;
    toolEvidenceId?: string;
    taskId?: string;
  }
): CheckpointData {
  return {
    ...checkpoint,
    step: "tool_call",
    stepIndex: checkpoint.stepIndex ? checkpoint.stepIndex + 1 : 1,
    toolCalls: [
      ...(checkpoint.toolCalls || []),
      `${toolInfo.toolName}:${toolInfo.toolInput.substring(0, 50)}`,
    ],
    evidenceId: toolInfo.toolEvidenceId || checkpoint.evidenceId,
    taskId: toolInfo.taskId || checkpoint.taskId,
    note: `Tool ${toolInfo.toolName} executed`,
  };
}
