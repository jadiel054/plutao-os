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
    systemBlock: "github: CONNECTED\n  read: repo_get\n  write (gated): repo_create, push_files",
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
    if (userText.includes("ideias de crescimento para o bugmeme")) {
      return {
        contextBlocks: [
          "[EXECUÇÃO DE FERRAMENTA DO CONECTOR GITHUB]\nCapability executada: repo_get\nStatus: Sucesso (45ms)\nDados retornados da API do GitHub:\nrepo: jadiel054/bugmeme\ndescription: Site de memes para devs",
        ],
        github: {
          executed: true,
          capability: "repo_get",
          trace: {
            id: "trace-repo-get-1",
            provider: "github",
            capability: "repo_get",
            status: "ok",
            input: { owner: "jadiel054", repo: "bugmeme" },
            output: "repo: jadiel054/bugmeme\ndescription: Site de memes para devs",
            durationMs: 45,
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
  chatCompletion: vi.fn().mockImplementation(async (_config, messages) => {
    const isRepoGet = messages.some(
      (m: { content: string }) => typeof m.content === "string" && m.content.includes("Capability executada: repo_get")
    );
    if (isRepoGet) {
      return {
        provider: "groq",
        model: "openai/gpt-oss-120b",
        content: "**Resultado final:** Aqui estão 3 ideias de crescimento para o **bugmeme** baseadas nos dados do repositório:\n1. Adicionar feed interativo de memes.\n2. Integrar exportação automática para redes sociais.",
      };
    }
    return {
      provider: "groq",
      model: "openai/gpt-oss-120b",
      content: "<raciocinio>\n- Intencao: criar repositorio\n- Decisao: criar write gate\n</raciocinio>\n<resposta>\nCriei a solicitação para criar o repositório 'novo-projeto'. Confirme a execução.\n</resposta>",
    };
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
import { chatCompletion } from "@/lib/runtime/model/client";

describe("Chat Path Regression Test (Write Intent & Analysis Intent)", () => {
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

  it("executes repo_get tool for growth analysis and returns direct value without opening with a 3-question questionnaire", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "ideias de crescimento para o bugmeme",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toBeDefined();

    // Verify tool_call step was returned for repo_get
    expect(json.steps).toBeDefined();
    const toolStep = json.steps.find((s: { type: string }) => s.type === "tool_call");
    expect(toolStep).toBeDefined();
    expect(toolStep.toolCall.provider).toBe("github");
    expect(toolStep.toolCall.capability).toBe("repo_get");
    expect(toolStep.toolCall.status).toBe("ok");

    // Verify answer contains direct ideas and no business intake questionnaire
    expect(json.message.content).toContain("ideias de crescimento para o **bugmeme**");
    expect(json.message.content).not.toContain("Qual é o foco principal");
    expect(json.message.content).not.toContain("Em que estágio ele está hoje");

    // Verify system prompt passed to model forbade discovery questionnaires when repo data exists
    const mockChatCompletion = vi.mocked(chatCompletion);
    expect(mockChatCompletion).toHaveBeenCalled();
    const passedMessages = mockChatCompletion.mock.calls[0][1];
    const systemPromptMsg = passedMessages.find((m) => m.role === "system")?.content || "";
    expect(systemPromptMsg).toContain("NÃO abra com questionário de descoberta");
    expect(systemPromptMsg).toContain("NUNCA faça o questionário de negócio de 3 itens");
  });
});
