/** Task status machine — Phase 2 (manual; no Agent Runtime). */

export const TASK_STATUSES = [
  "CREATED",
  "READY",
  "RUNNING",
  "WAITING",
  "BLOCKED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TERMINAL: ReadonlySet<TaskStatus> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  CREATED: ["READY", "CANCELLED"],
  READY: ["RUNNING", "BLOCKED", "CANCELLED"],
  RUNNING: ["WAITING", "BLOCKED", "COMPLETED", "FAILED", "CANCELLED"],
  WAITING: ["RUNNING", "BLOCKED", "CANCELLED", "FAILED"],
  BLOCKED: ["READY", "RUNNING", "CANCELLED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function isTaskStatus(v: string): v is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(v);
}

export function canTaskTransition(from: string, to: string): boolean {
  if (!isTaskStatus(from) || !isTaskStatus(to)) return false;
  return TASK_TRANSITIONS[from].includes(to);
}

export function nextTaskStatuses(from: string): TaskStatus[] {
  if (!isTaskStatus(from)) return [];
  return [...TASK_TRANSITIONS[from]];
}
