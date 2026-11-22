import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveRuntimeJobOutcome, RUNTIME_JOB_CONTINUATION_DELAY_MS } from "../durableJobs";
import {
  finishSerialMissionGraphNode,
  initializeMissionGraphRuntime,
  nextSerialMissionGraphNode,
  startSerialMissionGraphNode,
} from "@/lib/missions/serialGraphRuntime";
import { processUserRuntimeJobs } from "../processUserJobs";
import { runAutonomousMissionServer } from "@/lib/cockpit/runAutonomousMissionServer";
import * as clientModule from "@/lib/runtime/model/client";
import * as dbModule from "@/lib/db";
import * as gatesModule from "@/lib/connectors/gates";
import * as ensureModule from "@/lib/runtime/ensure";

vi.stubEnv("MODEL_API_KEY", "test-key");

const mockGraphV2 = {
  version: 2 as const,
  nodes: [
    {
      id: "node-1",
      kind: "work" as const,
      title: "Passo 1: Registrar nota explicativa",
      description: "Escrever nota no sistema",
      definitionOfDone: "sucesso",
      specialistProfileId: null,
      requiredCapabilities: [],
      dependsOn: [],
      retryPolicy: { maxAttempts: 1, timeoutSeconds: 300 },
    },
  ],
};

function getTableName(table: unknown): string {
  if (!table || typeof table !== "object") return "";
  const record = table as Record<string | symbol, unknown>;
  const underscore = record._;
  if (underscore && typeof underscore === "object") {
    const name = (underscore as Record<string, unknown>).name;
    if (typeof name === "string") return name;
  }
  if (typeof record.tableName === "string") return record.tableName;
  for (const sym of Object.getOwnPropertySymbols(record)) {
    const val = record[sym];
    if (typeof val === "string") return val;
    if (val && typeof val === "object" && typeof (val as Record<string, unknown>).name === "string") {
      return (val as Record<string, unknown>).name as string;
    }
  }
  return String(table);
}

function parseSqlCheckpoint(
  patchCheckpoint: unknown,
  existingCheckpoint: unknown
): Record<string, unknown> {
  const base =
    existingCheckpoint && typeof existingCheckpoint === "object" && !("queryChunks" in existingCheckpoint)
      ? (existingCheckpoint as Record<string, unknown>)
      : {};
  if (!patchCheckpoint || typeof patchCheckpoint !== "object") return base;
  const rawPatch = patchCheckpoint as Record<string, unknown>;
  if ("queryChunks" in rawPatch && Array.isArray(rawPatch.queryChunks)) {
    for (const chunk of rawPatch.queryChunks) {
      if (typeof chunk === "string") {
        const trimmed = chunk.trim();
        if (trimmed.startsWith("{")) {
          try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            return { ...base, ...parsed };
          } catch {
            /* ignore */
          }
        }
      }
    }
    return base;
  }
  return { ...base, ...rawPatch };
}

describe("Serial Worker Pipeline End-to-End Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ensureModule, "ensureExecutionsTable").mockResolvedValue(undefined as unknown as void);
    vi.spyOn(gatesModule, "listWriteGatesForExecution").mockResolvedValue([]);
  });

  describe("Single-unit State Machine Resolution", () => {
    it("resolveRuntimeJobOutcome marca SUCCEEDED somente quando execution é COMPLETED", () => {
      expect(resolveRuntimeJobOutcome(null, "COMPLETED", "VERIFYING")).toEqual({
        action: "succeed",
        status: "SUCCEEDED",
        reason: "EXECUTION_COMPLETED",
      });
    });

    it("resolveRuntimeJobOutcome marca FAILED sem re-enfileirar quando missão ou execution está FAILED", () => {
      expect(resolveRuntimeJobOutcome({ error: "NODE_FAILED" }, "FAILED", "FAILED")).toEqual({
        action: "fail",
        status: "FAILED",
        reason: "NODE_FAILED",
      });
    });
  });

  describe("Real Serial Graph Execution & Job Processing Pipeline", () => {
    it("Caminho feliz: PENDING job -> real runAutonomousMissionServer -> COMPLETED -> job SUCCEEDED", async () => {
      vi.spyOn(clientModule, "chatCompletion")
        .mockResolvedValueOnce({
          provider: "openai",
          model: "gpt-4o",
          content: "Registrando nota com sucesso.",
          toolProposal: {
            name: "note",
            input: "Registrando nota com sucesso",
          },
          usage: { promptTokens: 10, completionTokens: 10 },
          latencyMs: 100,
        })
        .mockResolvedValueOnce({
          provider: "openai",
          model: "gpt-4o",
          content: "Nota registrada com sucesso e DoD do nó satisfied.",
          toolProposal: null,
          usage: { promptTokens: 10, completionTokens: 10 },
          latencyMs: 100,
        });

      let storedMission = {
        id: "m1",
        userId: "u1",
        objective: "Registrar nota explicativa",
        definitionOfDone: null,
        evidence: [] as unknown[],
        status: "EXECUTING",
        graphVersion: 2,
        missionGraph: mockGraphV2,
        plan: null,
      };

      let storedExecution = {
        id: "exec-1",
        userId: "u1",
        missionId: "m1",
        currentTaskId: null,
        status: "RUNNING",
        checkpoint: {} as Record<string, unknown>,
        checkpointAt: new Date(),
        idempotencyKey: "k-1",
        error: null as string | null,
        startedAt: new Date(),
        updatedAt: new Date(),
        completedAt: null as Date | null,
        createdAt: new Date(),
      };

      let storedJob = {
        id: "job-1",
        userId: "u1",
        missionId: "m1",
        executionId: "exec-1",
        kind: "mission_execution",
        status: "PENDING",
        payload: {},
        attempts: 0,
        maxAttempts: 5,
        availableAt: new Date(),
        lockedAt: null as Date | null,
        lockToken: null as string | null,
        lastError: null as string | null,
        completedAt: null as Date | null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDb = {
        select: vi.fn().mockImplementation(() => {
          return {
            from: vi.fn().mockImplementation((table: unknown) => {
              const name = getTableName(table);
              const getResult = () => {
                if (name === "missions") return [storedMission];
                if (name === "executions") return [storedExecution];
                if (name === "runtime_jobs") return [storedJob];
                if (name === "users") return [{ id: "u1", preferredModel: "openai/gpt-4o" }];
                return [];
              };
              return {
                where: vi.fn().mockImplementation(() => {
                  return {
                    orderBy: vi.fn().mockImplementation(() => ({
                      limit: vi.fn().mockImplementation(async () => getResult()),
                    })),
                    limit: vi.fn().mockImplementation(async () => getResult()),
                  };
                }),
                innerJoin: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockImplementation(async () => getResult()),
              };
            }),
          };
        }),
        update: vi.fn().mockImplementation((table: unknown) => {
          const name = getTableName(table);
          return {
            set: (patch: Record<string, unknown>) => ({
              where: (_cond: unknown) => {
                if (name === "executions") {
                  const nextCheckpoint = parseSqlCheckpoint(patch.checkpoint, storedExecution.checkpoint);
                  storedExecution = { ...storedExecution, ...patch, checkpoint: nextCheckpoint };
                  return { returning: async () => [storedExecution] };
                }
                if (name === "missions") {
                  storedMission = { ...storedMission, ...patch };
                  return { returning: async () => [storedMission] };
                }
                if (name === "runtime_jobs") {
                  storedJob = { ...storedJob, ...patch };
                  return { returning: async () => [storedJob] };
                }
                return { returning: async () => [] };
              },
            }),
          };
        }),
      };

      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

      const runResult = await runAutonomousMissionServer({
        missionId: "m1",
        userId: "u1",
        executionId: "exec-1",
        missionGraph: mockGraphV2,
      });

      expect(runResult.ok).toBe(true);
      expect(storedExecution.status).toBe("COMPLETED");

      // Verify node checkpoint was persisted with graph runtime
      expect(storedExecution.checkpoint).toHaveProperty("missionGraphRuntime");
      const runtime = (storedExecution.checkpoint as Record<string, unknown>).missionGraphRuntime as {
        version: number;
        nodes: Record<string, { status: string }>;
      };
      expect(runtime.version).toBe(2);
      expect(runtime.nodes["node-1"]?.status).toBe("PASSED");

      // Now run processUserRuntimeJobs to verify the complete claim -> outcome pipeline
      const processResult = await processUserRuntimeJobs("u1", 1);
      expect(processResult.processed).toHaveLength(1);
      expect(processResult.processed[0]).toMatchObject({
        id: "job-1",
        status: "SUCCEEDED",
        executionStatus: "COMPLETED",
      });
    });

    it("Caminho de falha: Falha do nó -> execution FAILED -> job FAILED limpo", async () => {
      vi.spyOn(clientModule, "chatCompletion").mockRejectedValue(new Error("500 Internal Server Error"));

      let storedMission = {
        id: "m1",
        userId: "u1",
        objective: "Registrar nota explicativa",
        definitionOfDone: null,
        evidence: [] as unknown[],
        status: "EXECUTING",
        graphVersion: 2,
        missionGraph: mockGraphV2,
        plan: null,
      };

      let storedExecution = {
        id: "exec-1",
        userId: "u1",
        missionId: "m1",
        currentTaskId: null,
        status: "RUNNING",
        checkpoint: {} as Record<string, unknown>,
        checkpointAt: new Date(),
        idempotencyKey: "k-1",
        error: null as string | null,
        startedAt: new Date(),
        updatedAt: new Date(),
        completedAt: null as Date | null,
        createdAt: new Date(),
      };

      let storedJob = {
        id: "job-1",
        userId: "u1",
        missionId: "m1",
        executionId: "exec-1",
        kind: "mission_execution",
        status: "PENDING",
        payload: {},
        attempts: 0,
        maxAttempts: 5,
        availableAt: new Date(),
        lockedAt: null as Date | null,
        lockToken: null as string | null,
        lastError: null as string | null,
        completedAt: null as Date | null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDb = {
        select: vi.fn().mockImplementation(() => {
          return {
            from: vi.fn().mockImplementation((table: unknown) => {
              const name = getTableName(table);
              const getResult = () => {
                if (name === "missions") return [storedMission];
                if (name === "executions") return [storedExecution];
                if (name === "runtime_jobs") return [storedJob];
                if (name === "users") return [{ id: "u1", preferredModel: "openai/gpt-4o" }];
                return [];
              };
              return {
                where: vi.fn().mockImplementation(() => {
                  return {
                    orderBy: vi.fn().mockImplementation(() => ({
                      limit: vi.fn().mockImplementation(async () => getResult()),
                    })),
                    limit: vi.fn().mockImplementation(async () => getResult()),
                  };
                }),
                innerJoin: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockImplementation(async () => getResult()),
              };
            }),
          };
        }),
        update: vi.fn().mockImplementation((table: unknown) => {
          const name = getTableName(table);
          return {
            set: (patch: Record<string, unknown>) => ({
              where: (_cond: unknown) => {
                if (name === "executions") {
                  const nextCheckpoint = parseSqlCheckpoint(patch.checkpoint, storedExecution.checkpoint);
                  storedExecution = { ...storedExecution, ...patch, checkpoint: nextCheckpoint };
                  return { returning: async () => [storedExecution] };
                }
                if (name === "missions") {
                  storedMission = { ...storedMission, ...patch };
                  return { returning: async () => [storedMission] };
                }
                if (name === "runtime_jobs") {
                  storedJob = { ...storedJob, ...patch };
                  return { returning: async () => [storedJob] };
                }
                return { returning: async () => [] };
              },
            }),
          };
        }),
      };

      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

      const runResult = await runAutonomousMissionServer({
        missionId: "m1",
        userId: "u1",
        executionId: "exec-1",
        missionGraph: mockGraphV2,
      });

      expect(runResult.ok).toBe(false);
      expect(storedExecution.status).toBe("FAILED");
      expect(storedMission.status).toBe("FAILED");

      // Verify node checkpoint recorded failure
      const runtime = (storedExecution.checkpoint as Record<string, unknown>).missionGraphRuntime as {
        version: number;
        nodes: Record<string, { status: string }>;
      };
      expect(runtime.nodes["node-1"]?.status).toBe("FAILED");

      // Process job and ensure outcome is FAILED (without requeue loop)
      const processResult = await processUserRuntimeJobs("u1", 1);
      expect(processResult.processed).toHaveLength(1);
      expect(processResult.processed[0]).toMatchObject({
        id: "job-1",
        status: "FAILED",
        executionStatus: "FAILED",
      });
    });

    it("Isolamento por userId em processUserRuntimeJobs", async () => {
      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
        update: vi.fn().mockImplementation(() => ({
          set: () => ({
            where: () => ({
              returning: async () => [],
            }),
          }),
        })),
      };

      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

      const processResult = await processUserRuntimeJobs("u-unknown", 1);
      expect(processResult.processed).toHaveLength(0);
    });
  });
});

  describe("I-01 — missão multi-nó dependente até COMPLETED com evidência (prova serial do grafo v2)", () => {
    const twoNodeGraph = {
      version: 2 as const,
      nodes: [
        {
          id: "node-1",
          kind: "work" as const,
          title: "Nó 1: pesquisa e registro",
          description: "Registra a base da operação",
          definitionOfDone: "fila-a",
          specialistProfileId: null,
          requiredCapabilities: [],
          dependsOn: [] as string[],
          retryPolicy: { maxAttempts: 2, timeoutSeconds: 300 },
        },
        {
          id: "node-2",
          kind: "work" as const,
          title: "Nó 2: execução dependente do nó 1",
          description: "Consome o resultado do nó 1",
          definitionOfDone: "fila-b",
          specialistProfileId: null,
          requiredCapabilities: [],
          dependsOn: ["node-1"],
          retryPolicy: { maxAttempts: 2, timeoutSeconds: 300 },
        },
      ],
    };

    function buildSerialMockDb(state: {
      storedMission: Record<string, unknown>;
      storedExecution: Record<string, unknown>;
      storedJob: Record<string, unknown>;
    }) {
      return {
        select: vi.fn().mockImplementation(() => {
          return {
            from: vi.fn().mockImplementation((table: unknown) => {
              const name = getTableName(table);
              const getResult = () => {
                if (name === "missions") return [state.storedMission];
                if (name === "executions") return [state.storedExecution];
                if (name === "runtime_jobs") return [state.storedJob];
                if (name === "users") return [{ id: "u1", preferredModel: "openai/gpt-4o" }];
                return [];
              };
              return {
                where: vi.fn().mockImplementation(() => ({
                  orderBy: vi.fn().mockImplementation(() => ({
                    limit: vi.fn().mockImplementation(async () => getResult()),
                  })),
                  limit: vi.fn().mockImplementation(async () => getResult()),
                })),
                innerJoin: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockImplementation(async () => getResult()),
              };
            }),
          };
        }),
        update: vi.fn().mockImplementation((table: unknown) => {
          const name = getTableName(table);
          return {
            set: (patch: Record<string, unknown>) => ({
              where: (_cond: unknown) => {
                if (name === "executions") {
                  const nextCheckpoint = parseSqlCheckpoint(patch.checkpoint, state.storedExecution.checkpoint);
                  state.storedExecution = { ...state.storedExecution, ...patch, checkpoint: nextCheckpoint };
                  return { returning: async () => [state.storedExecution] };
                }
                if (name === "missions") {
                  state.storedMission = { ...state.storedMission, ...patch };
                  return { returning: async () => [state.storedMission] };
                }
                if (name === "runtime_jobs") {
                  state.storedJob = { ...state.storedJob, ...patch };
                  return { returning: async () => [state.storedJob] };
                }
                return { returning: async () => [] };
              },
            }),
          };
        }),
      };
    }

    it("dois nós dependentes: nó 1 → continuation → nó 2 → execution COMPLETED → mission COMPLETED → job SUCCEEDED", async () => {
      vi.spyOn(clientModule, "chatCompletion")
        .mockResolvedValueOnce({
          provider: "openai",
          model: "gpt-4o",
          content: "Iniciando nó 1 e registrando fase fila-a.",
          toolProposal: { name: "note", input: "fila-a registrada pelo nó 1" },
          usage: { promptTokens: 10, completionTokens: 10 },
          latencyMs: 10,
        })
        .mockResolvedValueOnce({
          provider: "openai",
          model: "gpt-4o",
          content: "Nó 1 concluído; fase fila-a registrada.",
          toolProposal: null,
          usage: { promptTokens: 10, completionTokens: 10 },
          latencyMs: 10,
        })
        .mockResolvedValueOnce({
          provider: "openai",
          model: "gpt-4o",
          content: "Iniciando nó 2 com a base do nó 1; fase fila-b.",
          toolProposal: { name: "note", input: "fila-b executada após fila-a" },
          usage: { promptTokens: 10, completionTokens: 10 },
          latencyMs: 10,
        })
        .mockResolvedValueOnce({
          provider: "openai",
          model: "gpt-4o",
          content: "Nó 2 concluído; fase fila-b registrada.",
          toolProposal: null,
          usage: { promptTokens: 10, completionTokens: 10 },
          latencyMs: 10,
        });

      const state = {
        storedMission: {
          id: "m1",
          userId: "u1",
          objective: "Prova serial: dois nós dependentes",
          definitionOfDone: null,
          evidence: [] as unknown[],
          status: "EXECUTING",
          graphVersion: 2,
          missionGraph: twoNodeGraph,
          plan: null,
        },
        storedExecution: {
          id: "exec-1",
          userId: "u1",
          missionId: "m1",
          currentTaskId: null,
          status: "RUNNING",
          checkpoint: {} as Record<string, unknown>,
          checkpointAt: new Date(),
          idempotencyKey: "k-i01",
          error: null as string | null,
          startedAt: new Date(),
          updatedAt: new Date(),
          completedAt: null as Date | null,
          createdAt: new Date(),
        },
        storedJob: {
          id: "job-1",
          userId: "u1",
          missionId: "m1",
          executionId: "exec-1",
          kind: "mission_execution",
          status: "PENDING",
          payload: {},
          attempts: 0,
          maxAttempts: 5,
          availableAt: new Date(Date.now() - 1000),
          lockedAt: null as Date | null,
          lockToken: null as string | null,
          lastError: null as string | null,
          completedAt: null as Date | null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      vi.spyOn(dbModule, "getDb").mockReturnValue(
        buildSerialMockDb(state) as unknown as ReturnType<typeof dbModule.getDb>
      );

      // ── Invocation 1: worker reivindica o job e executa apenas o nó 1 ──
      const firstProcess = await processUserRuntimeJobs("u1", 1);
      expect(firstProcess.processed).toHaveLength(1);
      expect(firstProcess.processed[0]).toMatchObject({
        id: "job-1",
        status: "CONTINUED",
        executionStatus: "RUNNING",
      });

      const checkpointAfterFirst = state.storedExecution.checkpoint as Record<string, unknown>;
      const runtimeAfterFirst = checkpointAfterFirst.missionGraphRuntime as {
        version: number;
        nodes: Record<string, { status: string }>;
      };
      expect(runtimeAfterFirst.version).toBe(2);
      expect(runtimeAfterFirst.nodes["node-1"]?.status).toBe("PASSED");
      expect(runtimeAfterFirst.nodes["node-2"]?.status === "PASSED").toBe(false);

      // Evidência do nó 1 existe e está escopada a ele; nó 2 ainda não produziu evidência.
      const evidenceAfterFirst = (state.storedMission.evidence as Array<Record<string, unknown>>).filter(
        (item) => item.executionId === "exec-1"
      );
      expect(evidenceAfterFirst.length).toBeGreaterThan(0);
      const nodeScoped = (nodeId: string) =>
        evidenceAfterFirst.filter((item) => (item.metadata as Record<string, unknown>)?.missionNodeId === nodeId);
      expect(nodeScoped("node-1").length).toBeGreaterThan(0);
      expect(nodeScoped("node-2")).toHaveLength(0);

      // ── Invocation 2: continuation devolveu o job à fila (delay 1s); worker executa o nó 2 ──
      await new Promise((resolve) => setTimeout(resolve, RUNTIME_JOB_CONTINUATION_DELAY_MS + 150));
      const secondProcess = await processUserRuntimeJobs("u1", 1);
      expect(secondProcess.processed).toHaveLength(1);
      expect(secondProcess.processed[0]).toMatchObject({
        id: "job-1",
        status: "SUCCEEDED",
        executionStatus: "COMPLETED",
      });

      // ── Estado final persistido ──
      expect(state.storedExecution.status).toBe("COMPLETED");
      expect(state.storedJob.status).toBe("SUCCEEDED");
      expect(state.storedJob.completedAt).toBeTruthy();
      expect(state.storedJob.lastError).toBeNull();
      expect(state.storedMission.status).toBe("COMPLETED");

      const runtimeFinal = (state.storedExecution.checkpoint as Record<string, unknown>)
        .missionGraphRuntime as { nodes: Record<string, { status: string }> };
      expect(runtimeFinal.nodes["node-1"]?.status).toBe("PASSED");
      expect(runtimeFinal.nodes["node-2"]?.status).toBe("PASSED");

      const node1Ev = nodeScoped("node-1");
      const node2Ev = (state.storedMission.evidence as Array<Record<string, unknown>>).filter(
        (item) => (item.metadata as Record<string, unknown>)?.missionNodeId === "node-2"
      );
      expect(node2Ev.length).toBeGreaterThan(0);
      const firstNode2At = Math.min(...node2Ev.map((e) => new Date(String(e.createdAt)).getTime()));
      const lastNode1At = Math.max(...node1Ev.map((e) => new Date(String(e.createdAt)).getTime()));
      expect(firstNode2At).toBeGreaterThanOrEqual(lastNode1At);
    });

    it("nó dependente não é liberado antes do anterior PASSED (scheduler serial)", () => {
      const runtime = initializeMissionGraphRuntime(twoNodeGraph, null)!;
      const next = nextSerialMissionGraphNode(twoNodeGraph, runtime);
      expect(next?.id).toBe("node-1");
      expect(isNodeReady(twoNodeGraph, runtime, "node-2")).toBe(false);

      const started = startSerialMissionGraphNode(twoNodeGraph, runtime, "node-1")!;
      const done = finishSerialMissionGraphNode(started, "node-1", { status: "PASSED" })!;
      expect(isNodeReady(twoNodeGraph, done, "node-2")).toBe(true);
      expect(nextSerialMissionGraphNode(twoNodeGraph, done)?.id).toBe("node-2");
    });
  });

function isNodeReady(graph: { nodes: Array<{ id: string; dependsOn: string[] }> }, runtime: { nodes: Record<string, { status: string }> }, nodeId: string): boolean {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  return node.dependsOn.every((dep) => runtime.nodes[dep]?.status === "PASSED");
}
