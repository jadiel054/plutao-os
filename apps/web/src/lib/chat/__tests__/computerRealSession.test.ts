/**
 * Fases 3+4 — PAUSA REAL DO AGENTE quando o humano controla a SESSÃO REMOTA
 * do Computador (regressão dos casos D e E do requisito 9).
 *
 * O gerenciador de sessões e o provedor são MOCKS aqui — a unidade sob teste
 * é o loop do buildRunner (`runChatBuildFlow`), que deve:
 *   D. pausar de verdade enquanto o humano controla a sessão;
 *   E. retomar do estado atualizado quando o controle é devolvido.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  return {
    session: {
      controller: "agent" as "agent" | "human",
      snapshotController: () => h.session.controller,
      compareAndSetController: (from: string, to: "agent" | "human") => {
        if (h.session.controller !== from) return false;
        h.session.controller = (to as "agent" | "human");
        return true;
      },
    },
  };
});

vi.mock("@/lib/computer/sessionManager", () => ({
  computerSessions: {
    activeFor: (conversationId: string | null | undefined, userId: string) => {
      if (conversationId === CONV_ID && userId === USER_ID) {
        return {
          snapshot: () => ({ controller: h.session.snapshotController(), status: "ready" }),
          compareAndSetController: h.session.compareAndSetController,
        };
      }
      return null;
    },
    reserve: vi.fn(),
    closeConversation: vi.fn(),
    view: vi.fn(),
    connectionInfoFor: vi.fn(),
    takeHumanControl: vi.fn(),
    releaseToAgent: vi.fn(),
    isHumanInControlFor: (conversationId: string | null | undefined, userId: string) =>
      conversationId === CONV_ID && userId === USER_ID && h.session.snapshotController() === "human",
  },
  resetComputerSessionsForTests: () => undefined,
}));

vi.mock("@/lib/runtime/model/client", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "@/lib/runtime/model/client";
import { releaseComputerControl, takeComputerControl } from "../computer";
import { runChatBuildFlow } from "../buildRunner";
import { InMemoryStorage, setStorageBackend, resetStorage } from "@/lib/runtime/tools/storage";

vi.mock("@/lib/events/appendConversationEvent", async (importOriginal) => {
  const original = (await importOriginal<typeof import("@/lib/events/appendConversationEvent")>());
  return {
    ...original,
    appendConversationEvent: vi.fn(async () => ({ ok: true, seq: 1 })),
  };
});

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
        }),
      }),
    }),
  }),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONV_ID = "22222222-2222-4222-8222-222222222222";

const mockedChatCompletion = vi.mocked(chatCompletion);

const modelConfig = {
  provider: "local" as const,
  model: "test-model",
  apiKey: "test-key",
  baseUrl: "http://127.0.0.1:1",
};

const writeProposal = (path: string) => ({
  content: JSON.stringify({
    tool: "filesystem",
    input: JSON.stringify({
      action: "write",
      payload: { path, content: `<h1>${path}</h1>` },
    }),
  }),
  toolProposal: {
    name: "filesystem",
    input: JSON.stringify({
      action: "write",
      payload: { path, content: `<h1>${path}</h1>` },
    }),
  },
  provider: "local" as const,
  model: "test-model",
  usage: {},
  latencyMs: 1,
});

describe("Computador real — pausa e retomada do agente (D e E)", () => {
  beforeEach(() => {
    mockedChatCompletion.mockReset();
    h.session.controller = "agent";
    setStorageBackend(new InMemoryStorage());
    return () => resetStorage();
  });

  it("D. humano no controle da sessão remota: tool proposta NÃO executa", async () => {
    h.session.controller = "human";
    mockedChatCompletion.mockResolvedValue(writeProposal("pages/d.html") as never);

    const result = await runChatBuildFlow({
      userId: USER_ID,
      conversationId: CONV_ID,
      userText: "continue a página",
      history: [],
      modelConfig,
    });

    if (!("executed" in result) || !result.executed) {
      throw new Error("fluxo deveria ter executado (mesmo que pausado)");
    }
    expect(result.pausedForHuman).toBe(true);
    expect(result.steps.length).toBe(0);
    expect(mockedChatCompletion).not.toHaveBeenCalled();
  });

  it("E. devolução do controle: o mesmo fluxo retoma e executa a tool", async () => {
    h.session.controller = "agent";
    mockedChatCompletion.mockResolvedValue(writeProposal("pages/e.html") as never);

    const result = await runChatBuildFlow({
      userId: USER_ID,
      conversationId: CONV_ID,
      userText: "continue",
      history: [],
      modelConfig,
    });

    if (!("executed" in result) || !result.executed) {
      throw new Error("fluxo deveria ter executado");
    }
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.some((s) => s.tool === "filesystem")).toBe(true);
    // Regressão: com a devolução efetivada o agente NÃO pausa.
    expect(result.pausedForHuman ?? false).toBe(false);
  });

  it("D→E na MESMA conversa: pausa, devolve e retoma com estado atualizado", async () => {
    h.session.controller = "human";
    mockedChatCompletion.mockResolvedValue(writeProposal("pages/de.html") as never);

    const paused = await runChatBuildFlow({
      userId: USER_ID,
      conversationId: CONV_ID,
      userText: "continue",
      history: [],
      modelConfig,
    });
    expect(paused).toMatchObject({ pausedForHuman: true });

    // Devolução pelo usuário (caminho da rota de takeover/release).
    await takeComputerControl(CONV_ID);
    h.session.controller = "agent";
    const released = await releaseComputerControl(CONV_ID);
    expect(released).toBe("agent");

    mockedChatCompletion.mockResolvedValueOnce(writeProposal("pages/de-2.html") as never);
    const resumed = await runChatBuildFlow({
      userId: USER_ID,
      conversationId: CONV_ID,
      userText: "continuar a partir daqui",
      history: [],
      modelConfig,
    });
    if (!("executed" in resumed) || !resumed.executed) {
      throw new Error("fluxo retomado deveria executar");
    }
    expect(resumed.steps.length).toBeGreaterThan(0);
    expect(resumed.pausedForHuman ?? false).toBe(false);
  });
});
