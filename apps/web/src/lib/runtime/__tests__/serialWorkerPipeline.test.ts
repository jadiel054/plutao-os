import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveRuntimeJobOutcome } from "../durableJobs";
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

function getTableName(table: any): string {
  if (!table) return "";
  if (typeof table._?.name === "string") return table._.name;
  if (typeof table.tableName === "string") return table.tableName;
  for (const sym of Object.getOwnPropertySymbols(table)) {
    const val = table[sym];
    if (typeof val === "string") return val;
    if (val && typeof val === "object" && typeof val.name === "string") return val.name;
  }
  return String(table);
}

function parseSqlCheckpoint(patchCheckpoint: any, existingCheckpoint: any) {
  const base =
    existingCheckpoint && typeof existingCheckpoint === "object" && !("queryChunks" in existingCheckpoint)
      ? existingCheckpoint
      : {};
  if (!patchCheckpoint || typeof patchCheckpoint !== "object") return base;
  if ("queryChunks" in patchCheckpoint && Array.isArray(patchCheckpoint.queryChunks)) {
    for (const chunk of patchCheckpoint.queryChunks) {
      if (typeof chunk === "string") {
        const trimmed = chunk.trim();
        if (trimmed.startsWith("{")) {
          try {
            const parsed = JSON.parse(trimmed);
            return { ...base, ...parsed };
          } catch {}
        }
      }
    }
    return base;
  }
  return { ...base, ...patchCheckpoint };
}

describe("Serial Worker Pipeline End-to-End Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ensureModule, "ensureExecutionsTable").mockResolvedValue(undefined as any);
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
          content: "Nota registrada com sucesso e DoD do nó satisfeita.",
          toolProposal: null,
          usage: { promptTokens: 10, completionTokens: 10 },
          latencyMs: 100,
        });

      let storedMission = {
        id: "m1",
        userId: "u1",
        objective: "Registrar nota explicativa",
        definitionOfDone: null,
        evidence: [] as any[],
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
            from: vi.fn().mockImplementation((table: any) => {
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
        update: vi.fn().mockImplementation((table: any) => {
          const name = getTableName(table);
          return {
            set: (patch: any) => ({
              where: (cond: any) => {
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

      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

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
      const runtime = (storedExecution.checkpoint as any).missionGraphRuntime;
      expect(runtime.version).toBe(2);
      expect(runtime.nodes["node-1"].status).toBe("PASSED");

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
        evidence: [] as any[],
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
            from: vi.fn().mockImplementation((table: any) => {
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
        update: vi.fn().mockImplementation((table: any) => {
          const name = getTableName(table);
          return {
            set: (patch: any) => ({
              where: (cond: any) => {
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

      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

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
      const runtime = (storedExecution.checkpoint as any).missionGraphRuntime;
      expect(runtime.nodes["node-1"].status).toBe("FAILED");

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

      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

      const processResult = await processUserRuntimeJobs("u-unknown", 1);
      expect(processResult.processed).toHaveLength(0);
    });
  });
});
