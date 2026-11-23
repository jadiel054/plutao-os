import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureGraphNodeTasks } from "../graphTasks";
import * as dbModule from "@/lib/db";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

type TaskRow = { id: string; missionId: string; graphNodeId?: string | null; title: string; status: string };

function manualTask(id: string, title = "Task manual"): TaskRow {
  return { id, missionId: "m1", graphNodeId: null, title, status: "CREATED" };
}

function graphTask(id: string, graphNodeId: string): TaskRow {
  return { id, missionId: "m1", graphNodeId, title: `Nó ${graphNodeId}`, status: "CREATED" };
}

function buildMockDb(state: { tasks: TaskRow[] }) {
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockImplementation(async () => [...state.tasks]),
        })),
      })),
    })),
    insert: vi.fn().mockImplementation((_table: unknown) => ({
      values: (vals: Record<string, unknown>) => ({
        onConflictDoNothing: vi.fn().mockImplementation(async () => {
          state.tasks.push({ id: `task-${state.tasks.length + 1}`, ...vals } as TaskRow);
          return [];
        }),
      }),
    })),
  };
}

const node = (id: string) => ({ id, title: `Nó ${id}`, description: null });

describe("graphTasks — ensureGraphNodeTasks", () => {
  let state: { tasks: TaskRow[] };
  let mockDb: ReturnType<typeof buildMockDb>;

  beforeEach(() => {
    state = { tasks: [] };
    mockDb = buildMockDb(state);
    vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);
  });

  it("A. missão com um nó e nenhuma task existente: cria a task do nó", async () => {
    await ensureGraphNodeTasks("m1", [node("node-1")]);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({ missionId: "m1", graphNodeId: "node-1", status: "CREATED", title: "Nó node-1" });
  });

  it("B. task manual (graphNodeId NULL) + nó não materializado: cria a task do grafo e NÃO altera a manual", async () => {
    state.tasks = [manualTask("t1")];
    await ensureGraphNodeTasks("m1", [node("node-1")]);
    const graph = state.tasks.filter((t) => t.graphNodeId === "node-1");
    const manual = state.tasks.filter((t) => t.id === "t1");
    expect(graph).toHaveLength(1);
    expect(manual).toHaveLength(1);
    expect(manual[0].graphNodeId).toBeNull();
    expect(manual[0].title).toBe("Task manual");
  });

  it("C. várias tasks manuais e vários nós: materializa todos os nós", async () => {
    state.tasks = [manualTask("t1", "pesquisa"), manualTask("t2", "revisão"), manualTask("t3", "notas")];
    await ensureGraphNodeTasks("m1", [node("node-1"), node("node-2"), node("node-3")]);
    const graph = state.tasks.filter((t) => typeof t.graphNodeId === "string").map((t) => t.graphNodeId).sort();
    expect(graph).toEqual(["node-1", "node-2", "node-3"]);
    expect(state.tasks.filter((t) => t.graphNodeId === null).map((t) => t.id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("D. nós parcialmente materializados: cria somente os ausentes", async () => {
    state.tasks = [manualTask("t1"), graphTask("tg1", "node-1")];
    await ensureGraphNodeTasks("m1", [node("node-1"), node("node-2"), node("node-3")]);
    const graph = state.tasks.filter((t) => typeof t.graphNodeId === "string").map((t) => t.graphNodeId).sort();
    expect(graph).toEqual(["node-1", "node-2", "node-3"]);
    expect(state.tasks).toHaveLength(4);
  });

  it("E. duas chamadas consecutivas: nenhuma duplicação", async () => {
    await ensureGraphNodeTasks("m1", [node("node-1"), node("node-2")]);
    const snapshot = state.tasks.map((t) => `${t.id}:${t.graphNodeId}`).sort();
    await ensureGraphNodeTasks("m1", [node("node-1"), node("node-2")]);
    expect(state.tasks.map((t) => `${t.id}:${t.graphNodeId}`).sort()).toEqual(snapshot);
    expect(state.tasks).toHaveLength(2);
  });

  it("F. tasks manuais jamais substituem tasks de nó do grafo", async () => {
    state.tasks = [manualTask("t1"), manualTask("t2"), manualTask("t3"), manualTask("t4")];
    await ensureGraphNodeTasks("m1", [node("node-1")]);
    expect(state.tasks.some((t) => t.graphNodeId === "node-1")).toBe(true);
    expect(state.tasks).toHaveLength(5);
    expect(state.tasks.filter((t) => t.graphNodeId === null)).toHaveLength(4);
  });
});
