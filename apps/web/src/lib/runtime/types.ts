export const EXECUTION_STATUSES = [
  "PENDING",
  "RUNNING",
  "PAUSED",
  "INTERRUPTED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/** Statuses that can be resumed without creating a new execution. */
export const RECOVERABLE: ReadonlySet<ExecutionStatus> = new Set([
  "RUNNING",
  "PAUSED",
  "INTERRUPTED",
]);

export const TERMINAL: ReadonlySet<ExecutionStatus> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export type CheckpointPayload = {
  step?: string;
  taskId?: string | null;
  note?: string;
  data?: Record<string, unknown>;
  /** G3: conversa do chat ligada a esta execution (event stream do Computador). */
  conversationId?: string | null;
  /**
   * H6 — orçamento acumulado de iterações do agent loop para esta execution,
   * somando todas as retomadas. Impede loop indefinido entre requests.
   */
  iterationsUsed?: number;
  /** H6 — tokens reportados pelo provedor, somando todas as retomadas. */
  tokensUsed?: number;
};

export function activeIdempotencyKey(missionId: string): string {
  return `mission:${missionId}:active`;
}
