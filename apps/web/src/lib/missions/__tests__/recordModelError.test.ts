import { describe, it, expect, vi, beforeEach } from "vitest";
import * as dbModule from "@/lib/db";
import { recordModelError, DEFAULT_MODEL_ERROR_HINT } from "../recordModelError";
import { parseEvidence } from "../ownership";

describe("recordModelError helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches model_error evidence with hint and status error for existing mission owned by user", async () => {
    const missionId = "m-existing-1";
    const userId = "u-owner-1";

    let storedEvidence: unknown[] = [
      {
        id: "ev-prev-1",
        type: "decision",
        content: "previous evidence",
        source: "user",
        taskId: null,
        missionId,
        createdAt: new Date().toISOString(),
      },
    ];

    let updatedSetData: Record<string, unknown> | null = null;

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        return Promise.resolve([{ evidence: storedEvidence }]);
      }),
      update: vi.fn().mockReturnValue({
        set: (patch: Record<string, unknown>) => {
          updatedSetData = patch;
          if (patch.evidence) {
            storedEvidence = patch.evidence as unknown[];
          }
          return {
            where: vi.fn().mockResolvedValue([{ id: missionId }]),
          };
        },
      }),
    };

    vi.spyOn(dbModule, "getDb").mockReturnValue(
      mockDb as unknown as ReturnType<typeof dbModule.getDb>
    );

    const result = await recordModelError({
      missionId,
      userId,
      error: new Error("503 Service Unavailable"),
      hint: "Custom hint text",
    });

    expect(result).not.toBeNull();
    expect(result?.type).toBe("model_error");
    expect(result?.status).toBe("error");
    expect(result?.content).toContain("503 Service Unavailable");
    expect(result?.content).toContain("hint: Custom hint text");
    expect(result?.source).toBe("model:plutao-primary");

    expect(mockDb.update).toHaveBeenCalled();
    expect(updatedSetData).not.toBeNull();

    const parsed = parseEvidence(storedEvidence);
    expect(parsed.length).toBe(2);

    const errItem = parsed.find((e) => e.type === "model_error");
    expect(errItem).toBeDefined();
    expect(errItem?.content).toContain("503 Service Unavailable");
    expect(errItem?.status).toBe("error");
  });

  it("uses default hint if no custom hint is provided", async () => {
    const missionId = "m-existing-2";
    const userId = "u-owner-2";

    let storedEvidence: unknown[] = [];

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ evidence: storedEvidence }]),
      update: vi.fn().mockReturnValue({
        set: (patch: Record<string, unknown>) => {
          if (patch.evidence) storedEvidence = patch.evidence as unknown[];
          return { where: vi.fn().mockResolvedValue([{ id: missionId }]) };
        },
      }),
    };

    vi.spyOn(dbModule, "getDb").mockReturnValue(
      mockDb as unknown as ReturnType<typeof dbModule.getDb>
    );

    const result = await recordModelError({
      missionId,
      userId,
      error: "401 Unauthorized",
    });

    expect(result).not.toBeNull();
    expect(result?.content).toContain(DEFAULT_MODEL_ERROR_HINT);

    const parsed = parseEvidence(storedEvidence);
    expect(parsed[0]?.content).toContain(DEFAULT_MODEL_ERROR_HINT);
  });

  it("does not write evidence when mission does not exist or userId differs (defense in depth)", async () => {
    const missionId = "m-other-user";
    const userId = "u-attacker";

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // No rows returned because of mismatched userId or missing mission
      update: vi.fn(),
    };

    vi.spyOn(dbModule, "getDb").mockReturnValue(
      mockDb as unknown as ReturnType<typeof dbModule.getDb>
    );

    const result = await recordModelError({
      missionId,
      userId,
      error: "Unauthorized attempt",
    });

    expect(result).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("returns null safely when missionId or userId is missing", async () => {
    const mockDb = {
      select: vi.fn(),
      update: vi.fn(),
    };

    vi.spyOn(dbModule, "getDb").mockReturnValue(
      mockDb as unknown as ReturnType<typeof dbModule.getDb>
    );

    const res1 = await recordModelError({
      missionId: null,
      userId: "u1",
      error: "Error",
    });
    expect(res1).toBeNull();

    const res2 = await recordModelError({
      missionId: "m1",
      userId: "",
      error: "Error",
    });
    expect(res2).toBeNull();

    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
