import { describe, it, expect, vi } from "vitest";
import { runConnectedConnectorTools, type ConnectorRuntimeSnapshot } from "../connectorRuntime";
import * as githubRunner from "@/lib/chat/githubToolRunner";
import * as vercelRunner from "@/lib/chat/vercelToolRunner";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/connectors/service", () => ({
  getConnectorRow: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock("@/lib/chat/exportToolRunner", () => ({
  detectAndExecuteExportTool: vi.fn().mockResolvedValue({ executed: false }),
}));

describe("runConnectedConnectorTools — error handling / catch path (BUG Item 3)", () => {
  it("marcas de fallback de erro devem retornar executed: false sem capability para não emitir tool_start sem trace", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.spyOn(githubRunner, "detectAndExecuteGitHubTool").mockRejectedValue(
      new Error("Falha de conexão com a API do GitHub")
    );
    vi.spyOn(vercelRunner, "detectAndExecuteVercelTool").mockRejectedValue(
      new Error("Vercel token expirado")
    );

    const snapshot: ConnectorRuntimeSnapshot = {
      connectors: [],
      systemBlock: "",
      githubConnected: true,
      githubLogin: "octocat",
      vercelConnected: true,
      vercelLogin: "vercel-user",
      vercelToken: "v-token",
      supabaseConnected: false,
      telegramConnected: false,
      cloudflareConnected: false,
      renderConnected: false,
    };

    const res = await runConnectedConnectorTools({
      userId: "usr-1",
      userText: "criar repositorio e publicar na vercel",
      snapshot,
    });

    expect(res.github.executed).toBe(false);
    expect(res.github.capability).toBeUndefined();
    expect(res.github.contextText).toContain("Falha de conexão com a API do GitHub");

    expect(res.vercel.executed).toBe(false);
    expect(res.vercel.capability).toBeUndefined();
    expect(res.vercel.contextText).toContain("Vercel token expirado");

    expect(res.contextBlocks).toHaveLength(2);
    expect(res.contextBlocks[0]).toContain("[ERRO NA FERRAMENTA GITHUB]");
    expect(res.contextBlocks[1]).toContain("[ERRO NA FERRAMENTA VERCEL]");
  });
});
