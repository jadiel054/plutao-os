import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createPlanFromTitles, missionPlanV1ToGraphV2 } from "@plutao/domain";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { GET, PATCH } from "./route";

const user = { id: "17e157d7-e9e1-4d48-a02f-2e9fdc5cd1d3" };
const params = Promise.resolve({ id: "mission-1" });

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/missions/mission-1/plan", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeMission(status = "PLANNING", aligned = false) {
  const plan = createPlanFromTitles(["Inspecionar solução"], { objective: "Desenvolver conteúdo" });
  const unalignedPlan = { ...plan, aligned };
  return {
    id: "mission-1",
    objective: "Desenvolver conteúdo",
    plan: unalignedPlan,
    missionGraph: missionPlanV1ToGraphV2(unalignedPlan),
    graphVersion: 2,
    status,
  };
}

function assignmentDb(mission: ReturnType<typeof makeMission>) {
  const selection = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([mission]),
  };
  const persisted = { patch: null as Record<string, unknown> | null };
  const returning = vi.fn().mockImplementation(async () => [
    { ...mission, ...(persisted.patch ?? {}) },
  ]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockImplementation((patch: Record<string, unknown>) => {
    persisted.patch = patch;
    return { where };
  });
  const update = vi.fn().mockReturnValue({ set });
  const select = vi.fn().mockReturnValue(selection);
  return { db: { select, update }, set, returning, persisted };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue(user as never);
});

describe("PATCH /api/missions/:id/plan assign_specialist", () => {
  it("expõe somente as opções visíveis dos perfis no GET", async () => {
    const mock = assignmentDb(makeMission());
    vi.mocked(getDb).mockReturnValue(mock.db as never);

    const response = await GET(
      new NextRequest("http://localhost/api/missions/mission-1/plan"),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.specialistProfiles).toEqual([
      { id: "software_engineer", label: "Engenharia de software" },
      { id: "teaching_assistant", label: "Ensino e aprendizagem" },
    ]);
    expect(JSON.stringify(data)).not.toContain("Atue como especialista");
  });

  it("atribui um perfil conhecido antes do alinhamento e persiste a nova topologia", async () => {
    const mission = makeMission();
    const nodeId = mission.missionGraph.nodes[0]!.id;
    const mock = assignmentDb(mission);
    vi.mocked(getDb).mockReturnValue(mock.db as never);

    const response = await PATCH(
      makeRequest({
        action: "assign_specialist",
        nodeId,
        specialistProfileId: "teaching_assistant",
        requiredCapabilities: [],
      }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.graph.nodes[0]).toMatchObject({
      specialistProfileId: "teaching_assistant",
      requiredCapabilities: [],
    });
    expect(mock.set).toHaveBeenCalledWith(expect.objectContaining({
      graphVersion: 2,
      missionGraph: expect.objectContaining({ version: 2 }),
    }));
  });

  it("recusa capability fora da allowlist do perfil sem persistir", async () => {
    const mission = makeMission();
    const nodeId = mission.missionGraph.nodes[0]!.id;
    const mock = assignmentDb(mission);
    vi.mocked(getDb).mockReturnValue(mock.db as never);

    const response = await PATCH(
      makeRequest({
        action: "assign_specialist",
        nodeId,
        specialistProfileId: "teaching_assistant",
        requiredCapabilities: ["tool:github"],
      }),
      { params }
    );
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toBe("MISSION_GRAPH_SPECIALIST_POLICY_INVALID");
    expect(mock.set).not.toHaveBeenCalled();
  });

  it("retorna conflito quando o grafo mudou antes da gravação condicional", async () => {
    const mission = makeMission();
    const nodeId = mission.missionGraph.nodes[0]!.id;
    const mock = assignmentDb(mission);
    mock.returning.mockResolvedValueOnce([]);
    vi.mocked(getDb).mockReturnValue(mock.db as never);

    const response = await PATCH(
      makeRequest({
        action: "assign_specialist",
        nodeId,
        specialistProfileId: "teaching_assistant",
        requiredCapabilities: [],
      }),
      { params }
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("MISSION_GRAPH_CHANGED_RETRY");
  });

  it("mantém o grafo imutável depois do alinhamento", async () => {
    const mock = assignmentDb(makeMission("EXECUTING", true));
    vi.mocked(getDb).mockReturnValue(mock.db as never);

    const response = await PATCH(
      makeRequest({
        action: "assign_specialist",
        nodeId: "irrelevante",
        specialistProfileId: "software_engineer",
      }),
      { params }
    );

    expect(response.status).toBe(409);
    expect(mock.set).not.toHaveBeenCalled();
  });
});
