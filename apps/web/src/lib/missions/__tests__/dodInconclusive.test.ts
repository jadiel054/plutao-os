/**
 * H2 — `force=true` liberava COMPLETED sem evidência (bypass do DoD).
 *
 * O parâmetro foi REMOVIDO. Sem evidência o estado máximo é INCONCLUSIVE —
 * nunca COMPLETED.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; userId: string; status: string };

const missionRow: Row = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userId: "11111111-1111-4111-8111-111111111111",
  status: "VERIFYING",
};
const updates: Array<Record<string, unknown>> = [];
let dodPasses = false;

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ id: missionRow.id, status: missionRow.status }] }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          updates.push(patch);
          if (typeof patch.status === "string") missionRow.status = patch.status;
          return undefined;
        },
      }),
    }),
  }),
}));

vi.mock("@/lib/missions/ownership", () => ({
  getOwnedMission: async () => ({
    id: missionRow.id,
    userId: missionRow.userId,
    status: missionRow.status,
    objective: "publicar release",
    definitionOfDone: { criteria: ["tool_result"] },
    evidence: [],
  }),
  parseEvidence: (v: unknown) => v,
}));

vi.mock("@/lib/missions/dod", () => ({
  verifyDefinitionOfDone: () => ({
    passed: dodPasses,
    summary: dodPasses ? "DoD satisfeito" : "Sem evidência de tool_result",
    checks: [],
  }),
}));

import { MISSION_STATUSES, TERMINAL_STATUSES, canTransition, nextStatuses } from "../lifecycle";
import { transitionMissionStatus } from "../transition";

describe("H2 — DoD sem bypass", () => {
  beforeEach(() => {
    missionRow.status = "VERIFYING";
    updates.length = 0;
    dodPasses = false;
  });

  it("INCONCLUSIVE existe e é terminal", () => {
    expect(MISSION_STATUSES).toContain("INCONCLUSIVE");
    expect(TERMINAL_STATUSES.has("INCONCLUSIVE")).toBe(true);
    expect(nextStatuses("INCONCLUSIVE")).toEqual([]);
  });

  it("VERIFYING pode ir para INCONCLUSIVE", () => {
    expect(canTransition("VERIFYING", "INCONCLUSIVE")).toBe(true);
    expect(canTransition("CORRECTING", "INCONCLUSIVE")).toBe(true);
  });

  it("sem evidência: COMPLETED é recusado e o estado vira INCONCLUSIVE", async () => {
    const res = await transitionMissionStatus({
      missionId: missionRow.id,
      userId: missionRow.userId,
      toStatus: "COMPLETED",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe("INCONCLUSIVE");
      expect(res.status).not.toBe("COMPLETED");
      expect(res.capped).toBe(true);
      expect(res.requested).toBe("COMPLETED");
    }
    expect(missionRow.status).toBe("INCONCLUSIVE");
  });

  it("`force: true` não existe mais no contrato e não altera o resultado", async () => {
    // `force` não existe mais no contrato (era o bypass). Passamos mesmo assim,
    // via cast, para provar que o campo é ignorado e não muda o resultado.
    const legacyCall = {
      missionId: missionRow.id,
      userId: missionRow.userId,
      toStatus: "COMPLETED",
      force: true,
    } as unknown as Parameters<typeof transitionMissionStatus>[0];
    const res = await transitionMissionStatus(legacyCall);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.status).toBe("INCONCLUSIVE");
    expect(missionRow.status).toBe("INCONCLUSIVE");
  });

  it("com evidência: COMPLETED é permitido", async () => {
    dodPasses = true;
    const res = await transitionMissionStatus({
      missionId: missionRow.id,
      userId: missionRow.userId,
      toStatus: "COMPLETED",
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.status).toBe("COMPLETED");
    expect(missionRow.status).toBe("COMPLETED");
  });

  it("nunca grava COMPLETED sem DoD (nenhum update para COMPLETED)", async () => {
    await transitionMissionStatus({
      missionId: missionRow.id,
      userId: missionRow.userId,
      toStatus: "COMPLETED",
    });
    expect(updates.some((u) => u.status === "COMPLETED")).toBe(false);
  });
});
