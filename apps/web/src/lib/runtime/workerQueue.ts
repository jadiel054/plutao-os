export const RUNTIME_WORKER_QUEUE_TOPIC = "plutao-runtime-worker";

export const RUNTIME_WORKER_WAKE_REASONS = [
  "mission_enqueued",
  "write_gate_resolved",
  "graph_continued",
  "job_retry",
] as const;

export type RuntimeWorkerWakeReason = (typeof RUNTIME_WORKER_WAKE_REASONS)[number];
export type RuntimeWorkerWakeMessage = {
  version: 1;
  reason: RuntimeWorkerWakeReason;
};
export type RuntimeWorkerWakePublishResult = "published" | "disabled" | "failed";

const wakeReasonSet = new Set<string>(RUNTIME_WORKER_WAKE_REASONS);

export function isRuntimeWorkerWakeMessage(value: unknown): value is RuntimeWorkerWakeMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return (
    keys.length === 2 &&
    keys.includes("version") &&
    keys.includes("reason") &&
    record.version === 1 &&
    typeof record.reason === "string" &&
    wakeReasonSet.has(record.reason)
  );
}

/**
 * Publish only a small wake signal. The Postgres runtime_jobs row remains the
 * source of truth; scheduled GitHub Actions processing is the recovery path.
 * Dispatch is deliberately disabled unless the Production env flag is enabled.
 */
export async function publishRuntimeWorkerWake(
  reason: RuntimeWorkerWakeReason,
  options: { delaySeconds?: number } = {}
): Promise<RuntimeWorkerWakePublishResult> {
  if (
    process.env.VERCEL_ENV !== "production" ||
    process.env.RUNTIME_WORKER_QUEUE_ENABLED !== "true"
  ) {
    return "disabled";
  }

  const message: RuntimeWorkerWakeMessage = { version: 1, reason };
  const delaySeconds = Math.max(0, Math.ceil(options.delaySeconds ?? 0));

  try {
    const { send } = await import("@vercel/queue");
    if (delaySeconds > 0) {
      await send(RUNTIME_WORKER_QUEUE_TOPIC, message, { delaySeconds });
    } else {
      await send(RUNTIME_WORKER_QUEUE_TOPIC, message);
    }
    return "published";
  } catch {
    // Never log provider errors or message contents. The DB job remains durable
    // and the existing scheduled worker can recover it.
    console.warn(
      "[runtime-worker-queue] wake publish failed; durable database job remains available to scheduled recovery"
    );
    return "failed";
  }
}

/**
 * Acknowledge malformed wake signals without running the worker. For valid
 * signals, let failures bubble so Vercel Queues retries the notification.
 */
export async function processRuntimeWorkerWakeMessage(
  value: unknown,
  runWorker: () => Promise<Response>
): Promise<"processed" | "ignored"> {
  if (!isRuntimeWorkerWakeMessage(value)) {
    console.warn("[runtime-worker-queue] ignored invalid wake message");
    return "ignored";
  }

  const response = await runWorker();
  if (!response.ok) throw new Error(`RUNTIME_WORKER_HTTP_${response.status}`);

  const body = (await response.json().catch(() => null)) as { ok?: unknown } | null;
  if (!body || body.ok !== true) throw new Error("RUNTIME_WORKER_RESPONSE_INVALID");
  return "processed";
}
