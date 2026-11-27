import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<Record<string, unknown>> = [];
let shouldThrow = false;

vi.mock("../appendConversationEvent", () => ({
  appendConversationEvent: async (input: Record<string, unknown>) => {
    if (shouldThrow) throw new Error("db down");
    calls.push(input);
    return { id: "ev-" + calls.length, seq: calls.length, ...input } as unknown as never;
  },
}));

import { emitMissionEvent } from "../missionEventEmitter";

describe("emitMissionEvent", () => {
  beforeEach(() => {
    calls.length = 0;
    shouldThrow = false;
  });

  it("sem conversa vinculada: null e nenhum evento gravado (estado vazio honesto)", async () => {
    const r1 = await emitMissionEvent({ conversationId: null, missionId: "m-1", phase: "started", title: "x" });
    const r2 = await emitMissionEvent({ conversationId: undefined, missionId: "m-1", phase: "started", title: "x" });
    const r3 = await emitMissionEvent({ conversationId: "  ", missionId: "m-1", phase: "started", title: "x" });
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(r3).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("mapeia fases para tipos mission_* e anexa payload", async () => {
    await emitMissionEvent({ conversationId: "c1", missionId: "abc12345-xyz", phase: "started", title: "Nó iniciado: A", nodeId: "n1", executionId: "e1" });
    await emitMissionEvent({ conversationId: "c1", missionId: "abc12345-xyz", phase: "result", title: "ok", ok: true });
    await emitMissionEvent({ conversationId: "c1", missionId: "abc12345-xyz", phase: "failed", title: "falhou", ok: false, error: "MISSION_NODE_DOD_FAILED" });
    await emitMissionEvent({ conversationId: "c1", missionId: "abc12345-xyz", phase: "completed", title: "done", ok: true });
    await emitMissionEvent({ conversationId: "c1", missionId: "abc12345-xyz", phase: "linked", title: "vínculo criado" });
    expect(calls.map((c) => c.type)).toEqual([
      "mission_started",
      "mission_result",
      "mission_failed",
      "mission_completed",
      "mission_linked",
    ]);
    expect(calls.every((c) => c.source === "mission_runtime")).toBe(true);
    const first = calls[0] as { payload: Record<string, unknown>; preview: string };
    expect(first.payload.missionId).toBe("abc12345-xyz");
    expect(first.payload.nodeId).toBe("n1");
    expect(String(first.preview)).toContain("[abc12345]");
  });
});
