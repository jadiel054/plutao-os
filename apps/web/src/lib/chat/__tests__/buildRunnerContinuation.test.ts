import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chatCompletionMock = vi.fn();
vi.mock("@/lib/runtime/model/client", () => ({
  chatCompletion: (...args: unknown[]) => chatCompletionMock(...args),
}));

import { InMemoryStorage, resetStorage, setStorageBackend } from "@/lib/runtime/tools/storage";
import { runChatBuildFlow } from "../buildRunner";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONV_ID = "22222222-2222-4222-8222-222222222222";
const MODEL = { provider: "gemini", apiKey: "k", model: "m", baseUrl: "http://127.0.0.1:9" };

describe("runChatBuildFlow — estados da execução durável", () => {
  beforeEach(() => {
    setStorageBackend(new InMemoryStorage());
    chatCompletionMock.mockReset();
  });

  afterEach(() => {
    resetStorage();
  });

  it("orçamento de iterações esgotado → status 'continuing' com checkpoint", async () => {
    chatCompletionMock.mockResolvedValue({
      content: "",
      toolProposal: {
        name: "filesystem",
        input: JSON.stringify({ action: "write", payload: { path: "index.html", content: "<h1>oi</h1>" } }),
      },
    });
    const flow = await runChatBuildFlow({
      userId: USER_ID,
      conversationId: CONV_ID,
      userText: "crie um site",
      history: [],
      modelConfig: MODEL,
      maxIterations: 3,
    });
    if (!flow.executed) throw new Error("esperava fluxo executado");
    expect(flow.status).toBe("continuing");
    expect(flow.continuationState?.iterations).toBe(3);
    expect(flow.continuationState?.toolContextMessages.length).toBe(3);
    expect(flow.files.some((f) => f.path === "index.html")).toBe(true);
    expect(chatCompletionMock).toHaveBeenCalledTimes(3);
  });

  it("sem nova tool proposal → status 'completed'", async () => {
    chatCompletionMock
      .mockResolvedValueOnce({
        content: "",
        toolProposal: {
          name: "filesystem",
          input: JSON.stringify({ action: "write", payload: { path: "index.html", content: "x" } }),
        },
      })
      .mockResolvedValueOnce({ content: "pronto", toolProposal: null });
    const flow = await runChatBuildFlow({
      userId: USER_ID,
      conversationId: CONV_ID,
      userText: "crie",
      history: [],
      modelConfig: MODEL,
    });
    if (!flow.executed) throw new Error("esperava fluxo executado");
    expect(flow.status).toBe("completed");
    expect(flow.finalText).toBe("pronto");
    expect(flow.continuationState).toBeUndefined();
  });

  it("retoma de checkpoint (initialState) e conclui com contagem acumulada", async () => {
    chatCompletionMock.mockResolvedValue({ content: "fim", toolProposal: null });
    const flow = await runChatBuildFlow({
      userId: USER_ID,
      conversationId: CONV_ID,
      userText: "continue",
      history: [],
      modelConfig: MODEL,
      initialState: { iterations: 7, files: [{ path: "a.txt" }], toolContextMessages: [] },
    });
    if (!flow.executed) throw new Error("esperava fluxo executado");
    expect(flow.status).toBe("completed");
    expect(flow.iterations).toBe(8);
    expect(flow.files).toEqual([{ path: "a.txt" }]);
  });

  it("orçamento de tempo esgotado (budgetMs=0) → 'continuing' preservando o checkpoint anterior", async () => {
    const flow = await runChatBuildFlow({
      userId: USER_ID,
      conversationId: CONV_ID,
      userText: "continue",
      history: [],
      modelConfig: MODEL,
      budgetMs: 0,
      initialState: { iterations: 2, files: [], toolContextMessages: [] },
    });
    if (!flow.executed) throw new Error("esperava fluxo executado");
    expect(flow.status).toBe("continuing");
    expect(flow.iterations).toBe(2);
    expect(chatCompletionMock).not.toHaveBeenCalled();
  });
});
