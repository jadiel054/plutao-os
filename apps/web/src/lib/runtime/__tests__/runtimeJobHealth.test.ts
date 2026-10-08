import { describe, expect, it } from "vitest";
import { normalizeRuntimeJobHealth } from "../runtimeJobHealth";

describe("runtime job health", () => {
  it("normaliza contagens agregadas e timestamps sem expor identificadores", () => {
    const checkedAt = new Date("2026-10-08T04:00:00.000Z");
    const health = normalizeRuntimeJobHealth(
      {
        pending: "2",
        running: 1,
        waitingApproval: "3",
        succeeded: "10",
        failed: 4,
        cancelled: "5",
        expiredRunningLeases: "1",
        oldestPendingAt: "2026-10-08T03:55:00.000Z",
        oldestRunningAt: new Date("2026-10-08T03:50:00.000Z"),
        oldestWaitingApprovalAt: null,
      },
      checkedAt
    );

    expect(health).toEqual({
      checkedAt: "2026-10-08T04:00:00.000Z",
      counts: {
        pending: 2,
        running: 1,
        waitingApproval: 3,
        succeeded: 10,
        failed: 4,
        cancelled: 5,
      },
      expiredRunningLeases: 1,
      oldestPendingAt: "2026-10-08T03:55:00.000Z",
      oldestRunningAt: "2026-10-08T03:50:00.000Z",
      oldestWaitingApprovalAt: null,
    });
    expect(JSON.stringify(health)).not.toContain("missionId");
    expect(JSON.stringify(health)).not.toContain("executionId");
  });

  it("fecha valores inválidos e negativos de forma segura", () => {
    const health = normalizeRuntimeJobHealth(
      {
        pending: "not-a-number",
        running: -1,
        waitingApproval: undefined,
        succeeded: null,
        failed: 0,
        cancelled: 0,
        expiredRunningLeases: "NaN",
        oldestPendingAt: "invalid-date",
        oldestRunningAt: undefined,
        oldestWaitingApprovalAt: null,
      },
      new Date("2026-10-08T04:00:00.000Z")
    );

    expect(health.counts).toEqual({
      pending: 0,
      running: 0,
      waitingApproval: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    });
    expect(health.expiredRunningLeases).toBe(0);
    expect(health.oldestPendingAt).toBeNull();
  });
});
