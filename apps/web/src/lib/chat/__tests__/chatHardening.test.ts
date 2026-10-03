import { describe, it, expect, vi, beforeEach } from "vitest";
import * as gatesService from "@/lib/connectors/gates";
import * as connectorService from "@/lib/connectors/service";
import { runVercel } from "@/lib/runtime/tools/vercel";
import { detectAndExecuteVercelTool, isValidVercelProjectName } from "@/lib/chat/vercelToolRunner";
import { runConnectedConnectorTools, type ConnectorRuntimeSnapshot } from "@/lib/chat/connectorRuntime";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/connectors/service", () => ({
  getConnectorRow: vi.fn(),
  getAccessToken: vi.fn(),
}));

describe("Hardening do caminho de escrita do chat (Bugs 1 e 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectorService.getConnectorRow).mockResolvedValue({
      id: "conn-1",
      userId: "user-123",
      provider: "vercel",
      status: "connected",
      capabilities: [{ name: "project_create", mode: "write" }],
      scopes: [],
      accessTokenEnc: "enc",
      refreshTokenEnc: null,
      expiresAt: null,
      accountLogin: "user",
      accountLabel: null,
      lastError: null,
      connectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(connectorService.getAccessToken).mockResolvedValue("mock-vercel-token");
  });

  it("BUG 1 (P0) — Deve capturar erro na criação do Write Gate, emitir console.error e retornar mensagem de erro visível no runtime", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(gatesService, "createWriteGate").mockRejectedValue(new Error("Erro de conexão no banco de dados Neon"));

    const input = JSON.stringify({ action: "project_create", name: "plutao-golden" });
    const res = await runVercel(input, "user-123");

    expect(res.ok).toBe(false);
    expect(res.error).toContain("Não consegui iniciar a operação project_create: Erro de conexão no banco de dados Neon");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[runVercel createWriteGate error]",
      expect.objectContaining({
        action: "project_create",
        error: "Erro de conexão no banco de dados Neon",
      })
    );
  });

  it("BUG 1 (P0) — Runner do chat deve capturar exceções não tratadas e retornar contexto com erro visível", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(gatesService, "createWriteGate").mockRejectedValue(new Error("Falha grave de banco"));

    const snapshot: ConnectorRuntimeSnapshot = {
      connectors: [],
      systemBlock: "",
      githubConnected: false,
      githubLogin: null,
      vercelConnected: true,
      vercelLogin: "user",
      vercelToken: "token",
      supabaseConnected: false,
      telegramConnected: false,
      cloudflareConnected: false,
      renderConnected: false,
    };

    const res = await runConnectedConnectorTools({
      userId: "user-123",
      userText: "criar projeto plutao-golden na vercel",
      snapshot,
    });

    expect(res.contextBlocks.some((block) => block.includes("Não consegui iniciar a operação"))).toBe(true);
  });

  it("BUG 2 — Deve validar o nome do projeto Vercel e rejeitar nomes inválidos ou curtos como 'na'", () => {
    expect(isValidVercelProjectName("na")).toBe(false);
    expect(isValidVercelProjectName("a")).toBe(false);
    expect(isValidVercelProjectName("")).toBe(false);
    expect(isValidVercelProjectName("INVALID_NAME!")).toBe(false);
    expect(isValidVercelProjectName("plutao-golden")).toBe(true);
    expect(isValidVercelProjectName("my-app-123")).toBe(true);
  });

  it("BUG 2 — Payload com nome 'na' deve solicitar esclarecimento e NÃO criar write gate", async () => {
    const gateSpy = vi.spyOn(gatesService, "createWriteGate");

    const result = await detectAndExecuteVercelTool({
      text: "criar projeto chamado na na vercel",
      userId: "user-123",
      accessToken: "mock-token",
    });

    expect(result.executed).toBe(false);
    expect(result.missingArgs).toBe(true);
    expect(result.contextText).toContain("O usuário quer criar um projeto na Vercel, mas o nome informado (\"na\") é inválido ou ausente.");
    expect(gateSpy).not.toHaveBeenCalled();
  });
});
