/**
 * @plutao/domain — Pending Intents Contract
 * Aligned with Marco A: Pending Intent Contract + Idempotency
 */

export type PendingIntentStatus =
  | "PENDING"
  | "SYNCING"
  | "APPLIED"
  | "FAILED_RETRYABLE"
  | "FAILED_PERMANENT";

export type PendingIntentType = "CREATE_MISSION" | string;

export interface CreateMissionPayload {
  objective: string;
  context?: string | null;
  constraints?: string | null;
  definitionOfDone?: string | null;
}

export interface PendingIntentResult {
  remoteId?: string;
  responseData?: unknown;
}

export interface PendingIntent<T = unknown> {
  intentId: string;
  userId: string;
  idempotencyKey: string;
  type: PendingIntentType;
  payload: T;
  status: PendingIntentStatus;
  attempts: number;
  lastError?: string | null;
  lastAttemptAt?: string | null;
  createdAt: string;
  updatedAt: string;
  result?: PendingIntentResult | null;
}

const VALID_TRANSITIONS: Record<PendingIntentStatus, PendingIntentStatus[]> = {
  PENDING: ["SYNCING"],
  SYNCING: ["APPLIED", "FAILED_RETRYABLE", "FAILED_PERMANENT"],
  FAILED_RETRYABLE: ["SYNCING"],
  APPLIED: [],
  FAILED_PERMANENT: [],
};

export function canTransitionIntentStatus(
  currentStatus: PendingIntentStatus,
  nextStatus: PendingIntentStatus
): boolean {
  return VALID_TRANSITIONS[currentStatus]?.includes(nextStatus) ?? false;
}

export function transitionIntent<T>(
  intent: PendingIntent<T>,
  nextStatus: PendingIntentStatus,
  extra?: {
    error?: string | null;
    result?: PendingIntentResult | null;
  }
): PendingIntent<T> {
  if (!canTransitionIntentStatus(intent.status, nextStatus)) {
    throw new Error(
      `Transição de estado inválida para PendingIntent ${intent.intentId}: ${intent.status} → ${nextStatus}`
    );
  }

  const now = new Date().toISOString();
  const attempts = nextStatus === "SYNCING" ? intent.attempts + 1 : intent.attempts;

  return {
    ...intent,
    status: nextStatus,
    attempts,
    lastAttemptAt: nextStatus === "SYNCING" ? now : intent.lastAttemptAt,
    lastError: extra?.error !== undefined ? extra.error : intent.lastError,
    result: extra?.result !== undefined ? extra.result : intent.result,
    updatedAt: now,
  };
}
