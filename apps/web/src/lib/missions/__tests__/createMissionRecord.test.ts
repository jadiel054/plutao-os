import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { insert: vi.fn() },
  insertedValues: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/db", () => ({ getDb: () => mocks.db }));
vi.mock("@plutao/domain", () => ({
  missionObjectiveToGraphV2: () => ({ version: 2, nodes: [], edges: [] }),
}));

import { createMissionRecord } from "../createMissionRecord";
import { parseMissionIntake } from "../intake";

function input() {
  const parsed = parseMissionIntake({
    objective: "Criar uma missão sem iniciar",
    source: "mcp",
    idempotencyKey: "32b3f52f-3a82-4d32-97ea-ea95bd157421",
  }, null);
  if (!parsed.ok) throw new Error("fixture inválida");
  return parsed.input;
}

describe("createMissionRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertedValues = null;
    mocks.db.insert.mockImplementation(() => ({
      values: (values: Record<string, unknown>) => {
        mocks.insertedValues = values;
        return {
          returning: async () => [{
            id: "mission-1",
            objective: values.objective,
            status: values.status,
            currentState: values.currentState,
            creationSource: values.creationSource,
          }],
        };
      },
    }));
  });

  it("persists a mission in CREATED and leaves execution to the normal user flow", async () => {
    const result = await createMissionRecord("user-1", input());

    expect(mocks.insertedValues).toMatchObject({
      userId: "user-1",
      creationSource: "mcp",
      status: "CREATED",
      currentState: "CREATED",
      completedSteps: [],
      pendingSteps: [],
    });
    expect(result).toMatchObject({ deduplicated: false, mission: { id: "mission-1", status: "CREATED", currentState: "CREATED" } });
    expect("runtimeJobs" in (mocks.insertedValues || {})).toBe(false);
  });
});
