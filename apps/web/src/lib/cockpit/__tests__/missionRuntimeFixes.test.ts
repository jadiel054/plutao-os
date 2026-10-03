import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as handleGateAction } from "@/app/api/gates/[id]/route";
import * as runAutonomousMissionServerModule from "@/lib/cockpit/runAutonomousMissionServer";
import * as gatesService from "@/lib/connectors/gates";
import * as githubToolModule from "@/lib/runtime/tools/github";
import * as clientModule from "@/lib/runtime/model/client";
import * as dbModule from "@/lib/db";
import { runAgentLoop } from "@/lib/runtime/agent-loop";
import * as runtimeService from "@/lib/runtime/service";
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
  objective: "Liste meus repositórios públicos e grave uma note",
  definitionOfDone: null,
  evidence: [],
  status: "EXECUTING",
};

describe("Mission Runtime Fixes End-to-End Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
        checkpoint: {},
        updatedAt: new Date(),
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
      expect(errEv?.content).toContain("MODEL_CALL_FAILED");
      expect(errEv?.content).toContain("401 Unauthorized");
    });
  });

  describe("Bug 2 — Write mission resumes loop after gate approval", () => {
    it("automatically resumes mission loop when POST /api/gates/[id] receives decision approve", async () => {
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
        status: "pending",
        decision: null,
        decidedAt: null,
        executedAt: null,
        result: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.spyOn(gatesService, "markGateApproved").mockResolvedValue({
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
        status: "approved",
        decision: "approve",
        decidedAt: new Date(),
        executedAt: new Date(),
        result: { output: "repo criado" },
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.spyOn(githubToolModule, "runGithub").mockResolvedValue({
        ok: true,
        tool: "github",
        input: '{"action":"repo_create"}',
        output: "Repositório criado: plutao-missao-smoke",
        durationMs: 400,
      });

      // Mock db
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ evidence: [] }]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbModule.getDb>);

      const runAutoServerSpy = vi
        .spyOn(runAutonomousMissionServerModule, "runAutonomousMissionServer")
        .mockResolvedValue({
          ok: true,
          missionId,
          finalStatus: "EXECUTING",
          allowedTransitions: [],
          stepsOk: 1,
          completed: false,
          executionId: "exec-1",
          message: "Resumed and executed next tool (push_files)",
        });

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

      // Verify that runAutonomousMissionServer was automatically invoked with gate.missionId!
      expect(runAutoServerSpy).toHaveBeenCalledWith({
        missionId,
        userId,
      });
    });
  });
});
