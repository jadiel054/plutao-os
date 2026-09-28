import { describe, expect, it, vi, beforeEach } from "vitest";

const emitAction = vi.fn(async () => ({ seq: 1 }));
const emitObservation = vi.fn(async () => ({ seq: 2 }));

vi.mock("@/lib/events/appendConversationEvent", () => ({
  emitAction: (...args: unknown[]) => emitAction(...args),
  emitObservation: (...args: unknown[]) => emitObservation(...args),
}));

vi.mock("@/lib/missions/planEvents", () => ({
  recordToolOnMissionPlan: vi.fn(async () => undefined),
}));

vi.mock("@/lib/runtime/service", () => ({
  getOwnedExecution: vi.fn(async () => ({
    id: "ex1",
    missionId: "m1",
    userId: "u1",
    status: "RUNNING",
    currentTaskId: null,
    checkpoint: { conversationId: "conv-g3" },
  })),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ evidence: [] }],
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ id: "ex1" }],
        }),
      }),
    }),
  }),
}));

vi.mock("../note", () => ({
  runNote: async (input: string) => ({
    ok: true,
    tool: "note",
    input,
    output: "ok-note",
    durationMs: 1,
  }),
}));

vi.mock("../filesystem", () => ({
  runFilesystem: async () => ({
    ok: true,
    tool: "filesystem",
    input: "{}",
    output: "G3_OK",
    durationMs: 1,
  }),
}));

vi.mock("../github", () => ({
  runGithub: async () => ({
    ok: false,
    tool: "github",
    input: "{}",
    error: "skip",
    durationMs: 1,
  }),
}));

import { dispatchTool } from "../dispatcher";

describe("G3 dispatchTool emits conversation work events", () => {
  beforeEach(() => {
    emitAction.mockClear();
    emitObservation.mockClear();
  });

  it("emits action then observation when checkpoint has conversationId", async () => {
    const res = await dispatchTool({
      executionId: "ex1",
      userId: "u1",
      name: "note",
      input: "hello g3",
    });
    expect(res).toMatchObject({ applied: true });
    expect(emitAction).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-g3",
        tool: "note",
        source: "mission_runtime",
      })
    );
    expect(emitObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-g3",
        tool: "note",
        ok: true,
        source: "mission_runtime",
      })
    );
    const actionOrder = emitAction.mock.invocationCallOrder[0]!;
    const obsOrder = emitObservation.mock.invocationCallOrder[0]!;
    expect(actionOrder).toBeLessThan(obsOrder);
  });
});
