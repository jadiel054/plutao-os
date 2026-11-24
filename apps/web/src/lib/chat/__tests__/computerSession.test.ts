import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/events/appendConversationEvent", () => ({
  appendConversationEvent: vi.fn(async () => ({ ok: true })),
  emitAction: vi.fn(async () => ({ ok: true })),
  emitObservation: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/runtime/model/client", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "@/lib/runtime/model/client";
import {
  getComputerController,
  isComputerActionAllowed,
  pickScreenFile,
  releaseComputerControl,
  resetComputerControlForTests,
  takeComputerControl,
} from "../computer";
import { runChatBuildFlow } from "../buildRunner";
import { InMemoryStorage, setStorageBackend, resetStorage } from "@/lib/runtime/tools/storage";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONV_ID = "22222222-2222-4222-8222-222222222222";

const mockedChatCompletion = vi.mocked(chatCompletion);

function modelStep(content: string) {
  let proposal: { name: string; input: string } | null = null;
  try {
    const parsed = JSON.parse(content) as { tool?: string; input?: string };
    if (typeof parsed.tool === "string" && typeof parsed.input === "string") {
      proposal = { name: parsed.tool, input: parsed.input };
    }
  } catch {
    proposal = null;
  }
  return {
    content,
    toolProposal: proposal,
    provider: "local" as const,
    model: "test-model",
    usage: {},
    latencyMs: 1,
  };
}

describe("Computador do Plutão — sessão e controle", () => {
  beforeEach(() => {
    resetComputerControlForTests();
    setStorageBackend(new InMemoryStorage());
  });

  afterEach(() => {
    resetComputerControlForTests();
    resetStorage();
    vi.restoreAllMocks();
  });

  describe("controle exclusivo agente × humano", () => {
    it("sem registro, o controle é do agente", () => {
      expect(getComputerController(CONV_ID)).toBe("agent");
      expect(isComputerActionAllowed(CONV_ID)).toBe(false);
    });

    it("takeover → humano; release → agente; ações humanas só sob controle humano", () => {
      expect(takeComputerControl(CONV_ID)).toBe("human");
      expect(getComputerController(CONV_ID)).toBe("human");
      expect(isComputerActionAllowed(CONV_ID)).toBe(true);

      expect(releaseComputerControl(CONV_ID)).toBe("agent");
      expect(getComputerController(CONV_ID)).toBe("agent");
      expect(isComputerActionAllowed(CONV_ID)).toBe(false);
    });

    it("TTL devolve o controle para o agente automaticamente", () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
        takeComputerControl(CONV_ID);
        expect(getComputerController(CONV_ID)).toBe("human");

        vi.setSystemTime(new Date("2026-01-01T10:31:00Z"));
        expect(getComputerController(CONV_ID)).toBe("agent");
        expect(isComputerActionAllowed(CONV_ID)).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it("conversas diferentes têm controles independentes", () => {
      const other = "33333333-3333-4333-8333-333333333333";
      takeComputerControl(CONV_ID);
      expect(getComputerController(other)).toBe("agent");
    });
  });

  describe("tela real (fallback honesto)", () => {
    it("prefere index.html e recusa lista vazia", () => {
      expect(pickScreenFile([])).toBeNull();
      expect(
        pickScreenFile([{ name: "readme", type: "file" }])
      ).toBe("readme");
      expect(
        pickScreenFile([
          { name: "sobre.html", type: "file" },
          { name: "index.html", type: "file" },
        ])
      ).toBe("index.html");
      expect(
        pickScreenFile([{ name: "src", type: "directory" }])
      ).toBeNull();
    });
  });

  describe("agente pausa ao assumir o controle", () => {
    const modelConfig = {
      provider: "local" as const,
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "http://127.0.0.1:1",
    };

    it("fluxo para na fronteira de passo e reporta pausedForHuman", async () => {
      let calls = 0;
      mockedChatCompletion.mockImplementation(async () => {
        calls++;
        if (calls === 1) {
          return modelStep(
            JSON.stringify({
              tool: "filesystem",
              input: JSON.stringify({
                action: "write",
                payload: { path: "index.html", content: "<h1>Polo</h1>" },
              }),
            })
          );
        }
        return modelStep(
          JSON.stringify({
            tool: "filesystem",
            input: JSON.stringify({
              action: "write",
              payload: { path: "index2.html", content: "<h1>nao deve rodar</h1>" },
            }),
          })
        );
      });

      const flow = await runChatBuildFlow({
        userId: USER_ID,
        conversationId: CONV_ID,
        userText: "crie um sistema para uma sorveteria",
        history: [],
        modelConfig,
        onStep: () => {
          // O usuário assume o controle entre o primeiro e o segundo passo.
          takeComputerControl(CONV_ID);
        },
      });

      expect(flow.executed).toBe(true);
      if (flow.executed) {
        expect(flow.pausedForHuman).toBe(true);
        expect(flow.steps).toHaveLength(1);
        expect(flow.steps[0]!.ok).toBe(true);
        expect(calls).toBe(1);
      }

      // O passo em voo foi concluído; nada além dele executou.
      const { runFilesystem } = await import("@/lib/runtime/tools/filesystem");
      const list = await runFilesystem(
        JSON.stringify({ action: "list", payload: { path: "." } }),
        CONV_ID,
        USER_ID
      );
      expect(list.ok).toBe(true);
      if (!list.ok) throw new Error("list falhou");
      const parsed = JSON.parse(list.output) as { entries: Array<{ name: string }> };
      const names = parsed.entries.map((e) => e.name);
      expect(names).toContain("index.html");
      expect(names).not.toContain("index2.html");
    });

    it("sem takeover, o fluxo continua normalmente", async () => {
      let calls = 0;
      mockedChatCompletion.mockImplementation(async () => {
        calls++;
        if (calls === 1) {
          return modelStep(
            JSON.stringify({
              tool: "filesystem",
              input: JSON.stringify({
                action: "write",
                payload: { path: "index.html", content: "<h1>Loja</h1>" },
              }),
            })
          );
        }
        return modelStep("Criação concluída.");
      });

      const flow = await runChatBuildFlow({
        userId: USER_ID,
        conversationId: CONV_ID,
        userText: "crie um site de loja",
        history: [],
        modelConfig,
      });

      expect(flow.executed).toBe(true);
      if (flow.executed) {
        expect(flow.pausedForHuman).toBeUndefined();
        expect(flow.steps).toHaveLength(1);
        expect(calls).toBe(2);
      }
    });
  });

  describe("continuidade — reconexão preserva sessão e arquivos", () => {
    it("arquivos da conversa sobrevivem a uma 'nova sessão' (mesmo namespace)", async () => {
      const { dispatchChatBuildTool } = await import("../buildRunner");
      const write = await dispatchChatBuildTool({
        name: "filesystem",
        input: JSON.stringify({
          action: "write",
          payload: { path: "index.html", content: "<h1>Padaria</h1>" },
        }),
        userId: USER_ID,
        conversationId: CONV_ID,
      });
      expect(write.ok).toBe(true);

      // Simula reconexão: nova instância de lógica, mesmo conversationId.
      const getList = await dispatchChatBuildTool({
        name: "filesystem",
        input: JSON.stringify({ action: "list", payload: { path: "." } }),
        userId: USER_ID,
        conversationId: CONV_ID,
      });
      expect(getList.ok).toBe(true);
      if (!getList.ok) throw new Error("list falhou");
      const parsed = JSON.parse(getList.output) as { entries: Array<{ name: string }> };
      expect(parsed.entries.some((e) => e.name === "index.html")).toBe(true);
    });

    it("isola conversas diferentes (sandbox por conversationId)", async () => {
      const { dispatchChatBuildTool } = await import("../buildRunner");
      const other = "44444444-4444-4444-8444-444444444444";
      await dispatchChatBuildTool({
        name: "filesystem",
        input: JSON.stringify({
          action: "write",
          payload: { path: "index.html", content: "<h1>A</h1>" },
        }),
        userId: USER_ID,
        conversationId: CONV_ID,
      });
      const listOther = await dispatchChatBuildTool({
        name: "filesystem",
        input: JSON.stringify({ action: "list", payload: { path: "." } }),
        userId: USER_ID,
        conversationId: other,
      });
      expect(listOther.ok).toBe(true);
      if (!listOther.ok) throw new Error("falhou");
      const parsed = JSON.parse(listOther.output) as { entries: Array<{ name: string }> };
      expect(parsed.entries.some((e) => e.name === "index.html")).toBe(false);
    });
  });
});
