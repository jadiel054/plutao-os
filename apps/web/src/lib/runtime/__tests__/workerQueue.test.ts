import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("@vercel/queue", () => ({ send: sendMock }));

import { send } from "@vercel/queue";
import {
  isRuntimeWorkerWakeMessage,
  processRuntimeWorkerWakeMessage,
  publishRuntimeWorkerWake,
  RUNTIME_WORKER_QUEUE_TOPIC,
} from "../workerQueue";

const previousEnv = {
  vercelEnv: process.env.VERCEL_ENV,
  queueEnabled: process.env.RUNTIME_WORKER_QUEUE_ENABLED,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VERCEL_ENV = "production";
  process.env.RUNTIME_WORKER_QUEUE_ENABLED = "true";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (previousEnv.vercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = previousEnv.vercelEnv;
  if (previousEnv.queueEnabled === undefined) delete process.env.RUNTIME_WORKER_QUEUE_ENABLED;
  else process.env.RUNTIME_WORKER_QUEUE_ENABLED = previousEnv.queueEnabled;
});

describe("runtime worker queue wake signals", () => {
  it("does not publish unless both production and the explicit flag are set", async () => {
    process.env.RUNTIME_WORKER_QUEUE_ENABLED = "false";
    await expect(publishRuntimeWorkerWake("mission_enqueued")).resolves.toBe("disabled");
    expect(send).not.toHaveBeenCalled();

    process.env.RUNTIME_WORKER_QUEUE_ENABLED = "true";
    process.env.VERCEL_ENV = "preview";
    await expect(publishRuntimeWorkerWake("mission_enqueued")).resolves.toBe("disabled");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends only a version and bounded reason, with the requested retry delay", async () => {
    sendMock.mockResolvedValue({ messageId: "opaque-message-id" });
    await expect(
      publishRuntimeWorkerWake("graph_continued", { delaySeconds: 2 })
    ).resolves.toBe("published");

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      RUNTIME_WORKER_QUEUE_TOPIC,
      { version: 1, reason: "graph_continued" },
      { delaySeconds: 2 }
    );
    const serialized = JSON.stringify(sendMock.mock.calls[0]);
    expect(serialized).not.toContain("missionId");
    expect(serialized).not.toContain("executionId");
    expect(serialized).not.toContain("jobId");
    expect(serialized).not.toContain("payload");
  });

  it("sends immediate wake signals without delay options", async () => {
    sendMock.mockResolvedValue({ messageId: "opaque-message-id" });
    await expect(publishRuntimeWorkerWake("write_gate_resolved")).resolves.toBe("published");
    expect(send).toHaveBeenCalledWith(RUNTIME_WORKER_QUEUE_TOPIC, {
      version: 1,
      reason: "write_gate_resolved",
    });
  });

  it("keeps a durable DB enqueue successful when queue publishing fails", async () => {
    sendMock.mockRejectedValue(new Error("provider detail must not be logged"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(publishRuntimeWorkerWake("mission_enqueued")).resolves.toBe("failed");
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).not.toContain("provider detail");
  });

  it("accepts only the exact wake message contract", () => {
    expect(isRuntimeWorkerWakeMessage({ version: 1, reason: "mission_enqueued" })).toBe(true);
    expect(isRuntimeWorkerWakeMessage({ version: 1, reason: "unknown" })).toBe(false);
    expect(isRuntimeWorkerWakeMessage({ version: 1, reason: "mission_enqueued", jobId: "x" })).toBe(false);
    expect(isRuntimeWorkerWakeMessage(null)).toBe(false);
  });

  it("runs the protected worker once for a valid message and ignores invalid ones", async () => {
    const runWorker = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(
      processRuntimeWorkerWakeMessage({ version: 1, reason: "job_retry" }, runWorker)
    ).resolves.toBe("processed");
    expect(runWorker).toHaveBeenCalledOnce();

    runWorker.mockClear();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(processRuntimeWorkerWakeMessage({ bad: true }, runWorker)).resolves.toBe("ignored");
    expect(runWorker).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("throws a status-only error so Vercel Queues retries failed worker invocations", async () => {
    const runWorker = vi.fn(async () => new Response("sensitive body", { status: 503 }));
    await expect(
      processRuntimeWorkerWakeMessage({ version: 1, reason: "job_retry" }, runWorker)
    ).rejects.toThrow("RUNTIME_WORKER_HTTP_503");
  });
});
