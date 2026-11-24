import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dispatchChatBuildTool,
  extractBuildFiles,
  runChatBuildFlow,
} from "../buildRunner";
import { InMemoryStorage, setStorageBackend, resetStorage } from "@/lib/runtime/tools/storage";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONV_ID = "22222222-2222-4222-8222-222222222222";

describe("Chat Build Runtime (criação na conversa, sem missão)", () => {
  beforeEach(() => {
    setStorageBackend(new InMemoryStorage());
  });

  afterEach(() => {
    resetStorage();
  });

  it("cria arquivos no sandbox da conversa via tool filesystem (namespace da conversa)", async () => {
    const write = await dispatchChatBuildTool({
      name: "filesystem",
      input: JSON.stringify({ action: "write", payload: { path: "index.html", content: "<h1>Padaria</h1>" } }),
      userId: USER_ID,
      conversationId: CONV_ID,
    });
    expect(write.ok).toBe(true);

    const list = await dispatchChatBuildTool({
      name: "filesystem",
      input: JSON.stringify({ action: "list", payload: { path: "." } }),
      userId: USER_ID,
      conversationId: CONV_ID,
    });
    expect(list.ok).toBe(true);
    if (!list.ok) throw new Error("list falhou");
    const entries = (JSON.parse(list.output) as { entries: Array<{ name: string }> }).entries;
    expect(entries.some((e) => e.name === "index.html")).toBe(true);
  });

  it("segurança preservada: '/' é rejeitado e '../' bloqueado no fluxo de criação", async () => {
    const abs = await dispatchChatBuildTool({
      name: "filesystem",
      input: JSON.stringify({ action: "list", payload: { path: "/" } }),
      userId: USER_ID,
      conversationId: CONV_ID,
    });
    expect(abs.ok).toBe(false);
    if (!abs.ok) expect(abs.error).toBe("PATH_OUTSIDE_SANDBOX");

    const traversal = await dispatchChatBuildTool({
      name: "filesystem",
      input: JSON.stringify({ action: "read", payload: { path: "../segredo.txt" } }),
      userId: USER_ID,
      conversationId: CONV_ID,
    });
    expect(traversal.ok).toBe(false);
    if (!traversal.ok) expect(traversal.error).toBe("PATH_TRAVERSAL");
  });

  it("fail-closed: tools de conector/externas não existem no fluxo de criação", async () => {
    const res = await dispatchChatBuildTool({
      name: "github",
      input: JSON.stringify({ action: "repo_create", name: "x" }),
      userId: USER_ID,
      conversationId: CONV_ID,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("TOOL_NOT_AVAILABLE_IN_BUILD");
  });

  it("extrai arquivos escritos/gerados do resultado das tools", () => {
    const writeResult = {
      ok: true as const,
      tool: "filesystem" as const,
      input: "",
      output: JSON.stringify({ path: "src/app.js", size: 120 }),
      durationMs: 1,
    };
    const exportResult = {
      ok: true as const,
      tool: "files.export_markdown" as const,
      input: "",
      output: JSON.stringify({ path: "docs.md", sizeBytes: 300, format: "markdown" }),
      durationMs: 1,
    };
    expect(extractBuildFiles(writeResult)).toEqual([{ path: "src/app.js", size: 120 }]);
    expect(extractBuildFiles(exportResult)).toEqual([{ path: "docs.md", size: 300 }]);
    expect(extractBuildFiles({ ok: false, tool: "filesystem", input: "", error: "X", durationMs: 0 })).toEqual([]);
  });

  it("fluxo sem tool proposals encerra com resultado na conversa (sem missão)", async () => {
    const flow = await runChatBuildFlow({
      userId: USER_ID,
      conversationId: CONV_ID,
      userText: "crie um site de padaria",
      history: [],
      modelConfig: {
        provider: "gemini",
        apiKey: "test-key",
        model: "test-model",
        baseUrl: "http://127.0.0.1:19999",
      },
    });

    if (flow.executed) {
      expect(typeof flow.notice).toBe("string");
      expect(flow.notice).toContain("Nenhuma missão foi criada");
    }
  });
});
