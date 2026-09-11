/**
 * Mission lifecycle — Phase 2 (manual transitions, no Agent Runtime yet).
 * status === currentState in this slice.
 */

export const MISSION_STATUSES = [
  "CREATED",
  "UNDERSTANDING",
  "PLANNING",
  "EXECUTING",
  "VERIFYING",
  "CORRECTING",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;

export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const TERMINAL_STATUSES: ReadonlySet<MissionStatus> = new Set([
  "COMPLETED",
  "CANCELLED",
  "FAILED",
]);

/** Allowed next states from each non-terminal status. */
export const MISSION_TRANSITIONS: Record<MissionStatus, readonly MissionStatus[]> = {
  CREATED: ["UNDERSTANDING", "CANCELLED"],
  UNDERSTANDING: ["PLANNING", "BLOCKED", "CANCELLED", "FAILED"],
  PLANNING: ["EXECUTING", "BLOCKED", "CANCELLED", "FAILED"],
  EXECUTING: ["VERIFYING", "CORRECTING", "BLOCKED", "CANCELLED", "FAILED"],
  VERIFYING: ["COMPLETED", "CORRECTING", "BLOCKED", "FAILED"],
  CORRECTING: ["EXECUTING", "VERIFYING", "BLOCKED", "FAILED", "CANCELLED"],
  BLOCKED: ["UNDERSTANDING", "PLANNING", "EXECUTING", "CANCELLED", "FAILED"],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};

export function isMissionStatus(value: string): value is MissionStatus {
  return (MISSION_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: string): boolean {
  if (!isMissionStatus(from) || !isMissionStatus(to)) return false;
  return MISSION_TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: string): MissionStatus[] {
  if (!isMissionStatus(from)) return [];
  return [...MISSION_TRANSITIONS[from]];
}
