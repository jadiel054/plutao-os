import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveRuntimeJobOutcome, retryRuntimeJob } from "../durableJobs";
import * as dbModule from "@/lib/db";

describe("runtime job state machine", () => {
  it("marca SUCCEEDED somente quando a execution persistida está COMPLETED", () => {
    expect(resolveRuntimeJobOutcome({ ok: false, error: "MODEL_CALL_FAILED" }, "COMPLETED")).toEqual({
      action: "succeed",
      status: "SUCCEEDED",
      reason: "MODEL_CALL_FAILED",
    });
  });

  it("marca FAILED quando a execution está FAILED sem re-enfileirar desnecessariamente", () => {
    expect(resolveRuntimeJobOutcome({ ok: true }, "FAILED")).toEqual({
      action: "fail",
      status: "FAILED",
      reason: "EXECUTION_FAILED",
    });
  });

  it("recoloca em fila uma execution ainda não terminal", () => {
    expect(resolveRuntimeJobOutcome({ ok: true }, "RUNNING")).toEqual({
      action: "retry",
      status: "PENDING",
      reason: "EXECUTION_NOT_TERMINAL",
    });
  });

  it("propaga cancelamento explicitamente", () => {
    expect(resolveRuntimeJobOutcome({ ok: true }, "CANCELLED")).toEqual({
      action: "cancel",
      status: "CANCELLED",
      reason: "EXECUTION_CANCELLED",
    });
  });

  it("encerra o job quando uma falha terminal de nó já colocou a missão em FAILED", () => {
    expect(resolveRuntimeJobOutcome({ error: "MISSION_NODE_DOD_FAILED" }, "FAILED", "FAILED")).toEqual({
      action: "fail",
      status: "FAILED",
      reason: "MISSION_NODE_DOD_FAILED",
    });
  });
});

describe("retryRuntimeJob", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createMockDb(overrides: {
    attempts?: number;
    maxAttempts?: number;
    found?: boolean;
  } = {}) {
    const attempts = overrides.attempts ?? 1;
    const maxAttempts = overrides.maxAttempts ?? 5;
    const found = overrides.found ?? true;

    const storedJob = {
      id: "job-1",
      status: "RUNNING",
      attempts,
      maxAttempts,
      lockToken: "token-abc",
      lastError: null as string | null,
      completedAt: null as Date | null,
      availableAt: new Date(),
      lockedAt: new Date(),
      updatedAt: new Date(),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(found ? [{ attempts, maxAttempts }] : []),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: (patch: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              if (!found) return [];
              Object.assign(storedJob, patch);
              return [storedJob];
            },
          }),
        }),
      }),
    };

    vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);
    return { mockDb, storedJob };
  }

  it("recoloca em PENDING quando attempts < maxAttempts e define completedAt = null", async () => {
    const { storedJob } = createMockDb({ attempts: 2, maxAttempts: 5 });

    const result = await retryRuntimeJob("job-1", "token-abc", "temporary failure");

    expect(result).not.toBeNull();
    expect(result?.status).toBe("PENDING");
    expect(result?.completedAt).toBeNull();
    expect(result?.lastError).toBeTruthy();
    expect(storedJob.status).toBe("PENDING");
    expect(storedJob.completedAt).toBeNull();
  });

  it("marca FAILED e preenche completedAt quando attempts >= maxAttempts", async () => {
    const { storedJob } = createMockDb({ attempts: 5, maxAttempts: 5 });

    const result = await retryRuntimeJob("job-1", "token-abc", "max attempts reached");

    expect(result).not.toBeNull();
    expect(result?.status).toBe("FAILED");
    expect(result?.completedAt).toBeInstanceOf(Date);
    expect(storedJob.status).toBe("FAILED");
    expect(storedJob.completedAt).toBeInstanceOf(Date);
  });

  it("retorna null quando o job não é encontrado (lock perdido)", async () => {
    createMockDb({ found: false });

    const result = await retryRuntimeJob("job-1", "wrong-token", "any error");

    expect(result).toBeNull();
  });
});
