import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as handleGateAction } from "@/app/api/gates/[id]/route";
import * as gatesService from "@/lib/connectors/gates";
import * as githubToolModule from "@/lib/runtime/tools/github";
import * as clientModule from "@/lib/runtime/model/client";
import * as dbModule from "@/lib/db";
import { runAgentLoop } from "@/lib/runtime/agent-loop";
import * as runtimeService from "@/lib/runtime/service";
import * as durableJobs from "@/lib/runtime/durableJobs";
import * as checkpointModule from "@/lib/runtime/checkpoint";
import * as sessionModule from "@/lib/auth/session";
import { parseEvidence } from "@/lib/missions/ownership";

// Mock environment
vi.stubEnv("MODEL_API_KEY", "test-key");

const mockExecution = {
  id: "exec-1",
  userId: "u1",
  missionId: "m1",
  currentTaskId: null,
  status: "RUNNING",
  checkpoint: {},
  checkpointAt: new Date(),
  idempotencyKey: "k-1",
  error: null,
  startedAt: new Date(),
  updatedAt: new Date(),
  completedAt: null,
  createdAt: new Date(),
};

const mockMission = {
  id: "m1",
  userId: "u1",
  objective: "crie um repositório chamado plutao-missao-smoke com README",
  definitionOfDone: null,
  evidence: [],
  status: "EXECUTING",
};

describe("Mission Runtime Fixes End-to-End Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(runtimeService, "writeCheckpoint").mockResolvedValue({
      execution: mockExecution,
    });
  });

  describe("Bug 1 — Read mission & model call error evidence", () => {
    it("runs repos_list tool ok and allows model to call note tool in the next iteration through real runModelStep", async () => {
      // Mock LLM chatCompletion calls
      const chatCompletionSpy = vi.spyOn(clientModule, "chatCompletion");

      // Mock GitHub tool response
      vi.spyOn(githubToolModule, "runGithub").mockResolvedValue({
        ok: true,
        tool: "github",
        input: '{"action":"repos_list"}',
        output: "repos: plutao-os, test-repo",
        durationMs: 329,
      });

      // Iteration 1: Model proposes github repos_list
      chatCompletionSpy.mockResolvedValueOnce({
        provider: "openai",
        model: "gpt-4o",
        content: '{"tool":"github","input":"{\\"action\\":\\"repos_list\\"}"}',
        toolProposal: { name: "github", input: '{"action":"repos_list"}' },
        usage: { promptTokens: 10, completionTokens: 10 },
        latencyMs: 100,
      });

      // Iteration 2: Model receives repos_list output and proposes note tool
      chatCompletionSpy.mockResolvedValueOnce({
        provider: "openai",
        model: "gpt-4o",
        content: '{"tool":"note","input":"Encontrados 2 repositórios públicos: plutao-os, test-repo"}',
        toolProposal: { name: "note", input: "Encontrados 2 repositórios públicos: plutao-os, test-repo" },
        usage: { promptTokens: 20, completionTokens: 15 },
        latencyMs: 120,
      });

      // Iteration 3: Model completes mission
      chatCompletionSpy.mockResolvedValueOnce({
        provider: "openai",
        model: "gpt-4o",
        content: "Resumo e note salvos com sucesso.",
        toolProposal: null,
        usage: { promptTokens: 30, completionTokens: 10 },
        latencyMs: 90,
      });

      // Mock DB
      let storedEvidence: unknown[] = [];
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          return Promise.resolve([
            {
              ...mockMission,
              evidence: storedEvidence,
              preferredModel: "openai/gpt-4o",
            },
          ]);
        }),
        update: vi.fn().mockReturnValue({
          set: (patch: { evidence?: unknown[] }) => ({
            where: () => {
              if (patch.evidence) storedEvidence = patch.evidence;
              return {
                returning: () => Promise.resolve([mockExecution]),
              };
            },
          }),
        }),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);
      vi.spyOn(runtimeService, "getOwnedExecution").mockResolvedValue(mockExecution);
      vi.spyOn(checkpointModule, "saveCheckpoint").mockResolvedValue({
        ok: true,
        checkpoint: {},
        checkpointAt: new Date().toISOString(),
      });

      const loopResult = await runAgentLoop("exec-1", "u1", 5);

      expect(loopResult.ok).toBe(true);
      expect(loopResult.iterations).toBe(3);
      expect(chatCompletionSpy).toHaveBeenCalledTimes(3);

      // Verify that note tool output evidence was recorded in storedEvidence!
      const parsed = parseEvidence(storedEvidence);
      const noteEv = parsed.find((e) => e.content.includes("tool:note →"));
      expect(noteEv).toBeDefined();
      expect(noteEv?.content).toContain("Encontrados 2 repositórios públicos");
    });

    it("records model_error evidence with hint when model call throws error", async () => {
      const chatCompletionSpy = vi.spyOn(clientModule, "chatCompletion");
      chatCompletionSpy.mockRejectedValue(new Error("401 Unauthorized API key"));

      let storedEvidence: unknown[] = [];
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          return Promise.resolve([
            {
              ...mockMission,
              evidence: storedEvidence,
              preferredModel: "openai/gpt-4o",
            },
          ]);
        }),
        update: vi.fn().mockReturnValue({
          set: (patch: { evidence?: unknown[] }) => ({
            where: () => {
              if (patch.evidence) storedEvidence = patch.evidence;
              return {
                returning: () => Promise.resolve([mockExecution]),
              };
            },
          }),
        }),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);
      vi.spyOn(runtimeService, "getOwnedExecution").mockResolvedValue(mockExecution);

      const loopResult = await runAgentLoop("exec-1", "u1", 5);

      expect(loopResult.ok).toBe(false);
      expect(loopResult.stopReason).toContain("MODEL_STEP_ERROR");

      // Verify model_error item with hint was recorded in DB evidence
      const parsed = parseEvidence(storedEvidence);
      const errEv = parsed.find((e) => e.type === "model_error");
      expect(errEv).toBeDefined();
      expect(errEv?.content).toBe("MODEL_UNAUTHORIZED");
      expect(errEv?.content).not.toContain("401 Unauthorized");
      expect(errEv?.metadata).toMatchObject({ category: "AUTH", retryable: false });
    });
  });

  describe("Write Gate approval resumes durable mission job", () => {
    it("executes the approved action, releases its durable job, and does not run the loop synchronously", async () => {
      const missionId = "m-write-1";
      const gateId = "gate-repo-create";
      const userId = "u1";

      vi.spyOn(sessionModule, "getSessionUser").mockResolvedValue({
        id: userId,
        email: "test@example.com",
      } as unknown as Awaited<ReturnType<typeof sessionModule.getSessionUser>>);

      vi.spyOn(gatesService, "getWriteGate").mockResolvedValue({
        id: gateId,
        userId,
        missionId,
        executionId: "exec-1",
        provider: "github",
        capability: "repo_create",
        target: "github.com/new/plutao-missao-smoke",
        summary: "Criar repositório plutao-missao-smoke",
        payload: { name: "plutao-missao-smoke", private: false },
        contentPreview: null,
        payloadHash: null,
        consumedAt: null,
        consumedBy: null,
        status: "pending",
    expiresAt: new Date(Date.now() + 900_000),
        decision: null,
        decidedAt: null,
        executedAt: null,
        result: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // H1 — a rota passou a usar approveGate (pending → approved) + consumo.
      vi.spyOn(gatesService, "approveGate").mockResolvedValue({
        id: gateId,
        userId,
        missionId,
        executionId: "exec-1",
        provider: "github",
        capability: "repo_create",
        target: "github.com/new/plutao-missao-smoke",
        summary: "Criar repositório plutao-missao-smoke",
        payload: { name: "plutao-missao-smoke", private: false },
        contentPreview: null,
        payloadHash: null,
        consumedAt: null,
        consumedBy: null,
        status: "approved",
    expiresAt: new Date(Date.now() + 900_000),
        decision: "approve",
        decidedAt: new Date(),
        executedAt: new Date(),
        result: { output: "Repositório criado: plutao-missao-smoke" },
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const runGithubSpy = vi.spyOn(githubToolModule, "runGithub");
      runGithubSpy.mockResolvedValueOnce({
        ok: true,
        tool: "github",
        input: '{"action":"repo_create","_gateApproved":true}',
        output: "Repositório criado: plutao-missao-smoke",
        durationMs: 400,
      });

      const chatCompletionSpy = vi.spyOn(clientModule, "chatCompletion");
      const releaseJobSpy = vi.spyOn(durableJobs, "releaseRuntimeJobAfterApproval").mockResolvedValue({
        id: "job-1",
        status: "PENDING",
      } as unknown as Awaited<ReturnType<typeof durableJobs.releaseRuntimeJobAfterApproval>>);

      let storedEvidence: unknown[] = [];
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          return Promise.resolve([
            {
              ...mockMission,
              id: missionId,
              status: "EXECUTING",
              evidence: storedEvidence,
              preferredModel: "openai/gpt-4o",
              plan: null,
            },
          ]);
        }),
        update: vi.fn().mockReturnValue({
          set: (patch: { evidence?: unknown[] }) => ({
            where: () => {
              if (patch.evidence) storedEvidence = patch.evidence;
              return {
                returning: () => Promise.resolve([{ ...mockExecution, missionId }]),
              };
            },
          }),
        }),
      };

      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);
      vi.spyOn(runtimeService, "getOwnedExecution").mockResolvedValue({
        ...mockExecution,
        missionId,
        status: "RUNNING",
      });
      vi.spyOn(runtimeService, "findRecoverableExecution").mockResolvedValue({
        ...mockExecution,
        missionId,
        status: "RUNNING",
      });

      // Call handleGateAction (POST /api/gates/[id]) with approve decision
      const req = new Request(`http://localhost/api/gates/${gateId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });

      const res = await handleGateAction(req as unknown as import("next/server").NextRequest, {
        params: Promise.resolve({ id: gateId }),
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.status).toBe("executed");

      expect(data.resumed).toBe(true);
      expect(releaseJobSpy).toHaveBeenCalledWith("exec-1", userId);
      expect(runGithubSpy).toHaveBeenCalledTimes(1);
      expect(chatCompletionSpy).not.toHaveBeenCalled();
      expect(parseEvidence(storedEvidence).some((item) => item.metadata?.writeGateId === gateId)).toBe(true);
    });
  });
});
