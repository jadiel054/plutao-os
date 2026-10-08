import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getRuntimeJobHealth: vi.fn(),
}));

vi.mock("@/lib/runtime/runtimeJobHealth", () => ({
  getRuntimeJobHealth: mocks.getRuntimeJobHealth,
}));

import { GET } from "./route";

function request(authorization?: string) {
  return new NextRequest("https://plutao.test/api/cron/runtime-worker/health", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("GET /api/cron/runtime-worker/health", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("recusa uma chamada sem o bearer do cron", async () => {
    const response = await GET(request("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(mocks.getRuntimeJobHealth).not.toHaveBeenCalled();
  });

  it("retorna somente o resumo agregado quando autenticada", async () => {
    mocks.getRuntimeJobHealth.mockResolvedValue({
      checkedAt: "2026-10-08T04:00:00.000Z",
      counts: {
        pending: 1,
        running: 0,
        waitingApproval: 2,
        succeeded: 7,
        failed: 0,
        cancelled: 1,
      },
      expiredRunningLeases: 0,
      oldestPendingAt: "2026-10-08T03:59:00.000Z",
      oldestRunningAt: null,
      oldestWaitingApprovalAt: "2026-10-08T03:40:00.000Z",
    });

    const response = await GET(request("Bearer cron-test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      service: "plutao-runtime-worker",
      worker: { cronConfigured: true, maxBatch: 1 },
      queue: { counts: { pending: 1, waitingApproval: 2 } },
    });
    expect(JSON.stringify(body)).not.toContain("missionId");
    expect(JSON.stringify(body)).not.toContain("executionId");
  });

  it("falha fechado quando a fila não está disponível", async () => {
    mocks.getRuntimeJobHealth.mockRejectedValue(new Error("database details must stay server-side"));

    const response = await GET(request("Bearer cron-test-secret"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      service: "plutao-runtime-worker",
      error: "DURABLE_QUEUE_UNAVAILABLE",
    });
  });
});
