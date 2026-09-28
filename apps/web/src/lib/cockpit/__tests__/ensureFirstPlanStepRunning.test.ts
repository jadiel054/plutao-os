import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanFromTitles, type MissionPlanV1 } from "@plutao/domain";

const missionStore: {
  plan: MissionPlanV1 | null;
  status: string;
} = {
  plan: null,
  status: "EXECUTING",
};

vi.mock("@/lib/missions/ownership", () => ({
  getOwnedMission: vi.fn(async () => {
    if (!missionStore.plan) return null;
    return {
      id: "m1",
      userId: "u1",
      objective: "H1",
      status: missionStore.status,
      plan: missionStore.plan,
      evidence: [],
      definitionOfDone: null,
    };
  }),
  parseEvidence: () => [],
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    update: () => ({
      set: (patch: { plan: MissionPlanV1 }) => ({
        where: async () => {
          missionStore.plan = patch.plan;
          return [];
        },
      }),
    }),
  }),
}));

import { ensureFirstPlanStepRunning } from "../runAutonomousMissionServer";

function alignedPendingPlan(): MissionPlanV1 {
  const base = createPlanFromTitles(["criar notes/h1-test.txt com H1_OK"]);
  return {
    ...base,
    aligned: true,
    events: [
      ...base.events,
      {
        id: "al",
        kind: "aligned",
        label: "Plano alinhado com o usuário",
        detail: "Execução liberada",
        at: new Date().toISOString(),
      },
    ],
  };
}

describe("ensureFirstPlanStepRunning", () => {
  beforeEach(() => {
    missionStore.plan = alignedPendingPlan();
    missionStore.status = "EXECUTING";
  });

  it("moves step 0 from PENDING to RUNNING when aligned", async () => {
    expect(missionStore.plan!.steps[0]!.status).toBe("PENDING");
    const next = await ensureFirstPlanStepRunning("m1", "u1");
    expect(next).not.toBeNull();
    expect(next!.steps[0]!.status).toBe("RUNNING");
    expect(missionStore.plan!.steps[0]!.status).toBe("RUNNING");
    expect(next!.events.some((e) => e.kind === "step_started")).toBe(true);
  });

  it("no-ops when plan is not aligned", async () => {
    missionStore.plan = createPlanFromTitles(["x"]);
    const next = await ensureFirstPlanStepRunning("m1", "u1");
    expect(next!.aligned).toBe(false);
    expect(next!.steps[0]!.status).toBe("PENDING");
  });

  it("no-ops when step 0 already RUNNING", async () => {
    const p = alignedPendingPlan();
    p.steps[0]!.status = "RUNNING";
    missionStore.plan = p;
    const next = await ensureFirstPlanStepRunning("m1", "u1");
    expect(next!.steps[0]!.status).toBe("RUNNING");
    // no extra step_started from this call beyond existing state
    const started = next!.events.filter((e) => e.kind === "step_started");
    expect(started.length).toBe(0);
  });
});
