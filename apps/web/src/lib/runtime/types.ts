export const EXECUTION_STATUSES = [
  "PENDING",
  "RUNNING",
  "PAUSED",
  "INTERRUPTED",
  "COMPLETED",
  "FAILED",
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
]);

export type CheckpointPayload = {
  step?: string;
  taskId?: string | null;
  note?: string;
  data?: Record<string, unknown>;
};

export function activeIdempotencyKey(missionId: string): string {
  return `mission:${missionId}:active`;
}
