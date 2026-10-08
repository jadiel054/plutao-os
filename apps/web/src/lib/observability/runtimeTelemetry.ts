import { randomUUID } from "node:crypto";
import { auditEvents } from "@plutao/db";
import { getDb } from "@/lib/db";
import { scrubValue } from "@/lib/events/scrub";
import { sanitizeText } from "@/lib/security/sanitize";

export type RuntimeTelemetryStatus =
  | "queued"
  | "started"
  | "succeeded"
  | "failed"
  | "requeued"
  | "cancelled"
  | "reconciled";
export type RuntimeTelemetryInput = {
  type?: string;
  userId?: string | null;
  requestId?: string | null;
  missionId?: string | null;
  executionId?: string | null;
  jobId?: string | null;
  provider?: string | null;
  model?: string | null;
  status: RuntimeTelemetryStatus;
  durationMs?: number | null;
  attempt?: number | null;
  errorType?: string | null;
  error?: string | null;
  tokenUsage?: number | null;
  metadata?: Record<string, unknown>;
};

export function createRequestId(value?: string | null) {
  const candidate = value?.trim();
  return candidate && candidate.length <= 120 ? candidate : randomUUID();
}

export async function recordRuntimeTelemetry(input: RuntimeTelemetryInput) {
  const payload = scrubValue({
    requestId: input.requestId ?? null,
    missionId: input.missionId ?? null,
    executionId: input.executionId ?? null,
    jobId: input.jobId ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
    status: input.status,
    durationMs: input.durationMs ?? null,
    attempt: input.attempt ?? null,
    errorType: input.errorType ?? null,
    error: input.error ? sanitizeText(input.error).slice(0, 2_000) : null,
    tokenUsage: input.tokenUsage ?? null,
    metadata: input.metadata ?? {},
  });
  try {
    const [row] = await getDb()
      .insert(auditEvents)
      .values({
        userId: input.userId ?? null,
        type: input.type ?? "runtime.telemetry",
        payload,
      })
      .returning({ id: auditEvents.id });
    return row?.id ?? null;
  } catch (error) {
    console.error("[runtime-telemetry] persist failed", error instanceof Error ? error.message : String(error));
    return null;
  }
}
