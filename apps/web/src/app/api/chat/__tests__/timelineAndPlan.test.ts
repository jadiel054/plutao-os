import { describe, it, expect, vi, beforeEach } from "vitest";
import { isExplicitMissionRequest } from "../route";
import { persistMessagePair } from "@/lib/chat/persistChatMessages";

vi.mock("@/lib/auth/session", () => ({
  getAuthOrGuestUser: vi.fn().mockResolvedValue({
    id: "user-123",
    email: "test@plutao.app",
    isGuest: false,
  }),
}));

vi.mock("@/lib/db", () => {
  const insertedValues: unknown[] = [];
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve([])),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((vals) => {
        if (Array.isArray(vals)) insertedValues.push(...vals);
        else insertedValues.push(vals);
        return {
          returning: vi.fn().mockImplementation(() => Promise.resolve([{ id: "conv-123" }])),
          then: (resolve: (v: unknown) => void) => resolve([{ id: "conv-123" }]),
        };
      }),
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    _insertedValues: insertedValues,
  };
  return {
    getDb: () => mockDb,
  };
});

vi.mock("@/lib/chat/connectorRuntime", () => ({
  loadConnectorRuntime: vi.fn().mockResolvedValue({
    connectors: ["github"],
    systemBlock: "github: CONNECTED\n  read: repo_get",
    githubConnected: true,
    githubLogin: "octocat",
    vercelConnected: false,
    vercelLogin: null,
    vercelToken: null,
    supabaseConnected: false,
    telegramConnected: false,
    cloudflareConnected: false,
    renderConnected: false,
  }),
  runConnectedConnectorTools: vi.fn().mockImplementation(async ({ userText }) => {
    if (userText.includes("bugmeme")) {
      return {
        contextBlocks: [
          "[EXECUÇÃO DE FERRAMENTA DO CONECTOR GITHUB]\nCapability executada: repo_get\nStatus: Sucesso (30ms)\nDados do repo: bugmeme",
        ],
        github: {
          executed: true,
          capability: "repo_get",
          trace: {
            id: "trace-1",
            provider: "github",
            capability: "repo_get",
            status: "ok",
            input: { owner: "octocat", repo: "bugmeme" },
            output: "repo: bugmeme",
            durationMs: 30,
          },
        },
        vercel: { executed: false },
        suggestedFollowUps: [],
      };
    }
    return {
      contextBlocks: [],
      github: { executed: false },
      vercel: { executed: false },
      suggestedFollowUps: [],
    };
  }),
}));

vi.mock("@/lib/runtime/model/client", () => ({
  chatCompletion: vi.fn().mockResolvedValue({
    provider: "groq",
    model: "openai/gpt-oss-120b",
    content: "Aqui estão as ações:\n1. Mapear oportunidades de crescimento.\n2. Implementar analytics de engajamento.\n3. Criar campanha de lançamento.",
  }),
  streamChatCompletion: vi.fn(),
}));

vi.mock("@/lib/runtime/model/config", () => ({
  getModelConfig: () => ({
    provider: "groq",
    apiKey: "mock-key",
    model: "openai/gpt-oss-120b",
  }),
}));

import { POST } from "../route";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

describe("Timeline & Anti-Auto-Mission Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isExplicitMissionRequest", () => {
    it("returns false for general analysis and growth prompts", () => {
      expect(isExplicitMissionRequest("ideias de crescimento para o bugmeme")).toBe(false);
      expect(isExplicitMissionRequest("overview do repo jadiel054/bugmeme")).toBe(false);
      expect(isExplicitMissionRequest("analisa o projeto e me da um resumo")).toBe(false);
      expect(isExplicitMissionRequest("me fala sobre o repositorio plutao-os")).toBe(false);
    });

    it("returns true when user explicitly asks for mission, execution, implementation or cockpit", () => {
      expect(isExplicitMissionRequest("criar missão para o bugmeme")).toBe(true);
      expect(isExplicitMissionRequest("executa o plano de ação")).toBe(true);
      expect(isExplicitMissionRequest("implementa a feature de auth")).toBe(true);
      expect(isExplicitMissionRequest("abrir no Cockpit")).toBe(true);
    });
  });

  describe("POST /api/chat suggestedPlan gating", () => {
    it("returns suggestedPlan = null for analysis/growth prompt despite numbered response list", async () => {
      const req = new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "ideias de crescimento para o bugmeme" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.suggestedPlan).toBeNull();
      expect(json.steps).toBeDefined();
      expect(json.steps.some((s: { type: string }) => s.type === "tool_call")).toBe(true);
    });

    it("extracts suggestedPlan when user explicitly asks for a mission", async () => {
      const req = new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "criar missão de crescimento para o bugmeme" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.suggestedPlan).not.toBeNull();
      expect(json.suggestedPlan.stepTitles.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("persistMessagePair with metadata", () => {
    it("stores metadata on assistant message insert", async () => {
      const db = getDb();
      const meta = { steps: [{ type: "tool_call", toolCall: { capability: "repo_get" } }] };

      await persistMessagePair(db, "conv-456", "pergunta do usuario", "resposta do assistente", meta);

      const mockDb = db as unknown as { _insertedValues: Array<{ role: string; content: string; metadata?: unknown }> };
      const assistantMsg = mockDb._insertedValues.find((v) => v.content === "resposta do assistente");
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.metadata).toEqual(meta);
    });
  });
});
