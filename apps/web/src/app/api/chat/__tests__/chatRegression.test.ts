import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies required by POST /api/chat
vi.mock("@/lib/auth/session", () => ({
  getAuthOrGuestUser: vi.fn().mockResolvedValue({
    id: "user-123",
    email: "test@plutao.app",
    isGuest: false,
  }),
}));

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve([])),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(() => Promise.resolve([{ id: "conv-123" }])),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return {
    getDb: () => mockDb,
  };
});

vi.mock("@/lib/chat/connectorRuntime", () => ({
  loadConnectorRuntime: vi.fn().mockResolvedValue({
    connectors: ["github"],
    systemBlock: "github: CONNECTED\n  write (gated): repo_create, push_files",
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
  runConnectedConnectorTools: vi.fn().mockImplementation(async ({ userId, userText }) => {
    // Simulate intent recognition for write action
    if (userText.includes("criar repositorio") || userText.includes("create repo")) {
      return {
        contextBlocks: [
          "[CONNECTOR RESULT: github / repo_create]\nGATE_PENDING — Ação de escrita requer aprovação do usuário.",
        ],
        github: {
          executed: true,
          capability: "repo_create",
          trace: {
            id: "gate-trace-1",
            provider: "github",
            capability: "repo_create",
            status: "GATE_PENDING",
            input: { name: "novo-projeto" },
            output: "GATE_PENDING — Ação de escrita aguardando confirmação no chat.",
            durationMs: 12,
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
    content: "<raciocinio>\n- Intencao: criar repositorio\n- Decisao: criar write gate\n</raciocinio>\n<resposta>\nCriei a solicitação para criar o repositório 'novo-projeto'. Confirme a execução.\n</resposta>",
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

describe("Chat Path Regression Test (Write Intent & Write Gate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles write intent in chat, triggers connector tool write gate and returns intact response", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Por favor, criar repositorio chamado novo-projeto no GitHub",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toBeDefined();
    expect(json.message).toBeDefined();
    expect(json.message.role).toBe("assistant");
    expect(json.message.content).toContain("Criei a solicitação para criar o repositório 'novo-projeto'");

    // Verify tool execution step / trace was populated with gate status
    expect(json.steps).toBeDefined();
    const toolStep = json.steps.find((s: { type: string }) => s.type === "tool_call");
    expect(toolStep).toBeDefined();
    expect(toolStep.toolCall.provider).toBe("github");
    expect(toolStep.toolCall.capability).toBe("repo_create");
    expect(toolStep.toolCall.status).toBe("GATE_PENDING");
  });
});
