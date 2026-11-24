/**
 * COMPUTADOR DO PLUTÃO — testes do requisito 6 (A–J).
 *
 * O control plane é compartilhado por DESIGN: o estado do controle é o ÚLTIMO
 * evento `source:"computer"` em `conversation_events` (append-only, seq
 * monotônico, Neon). O "banco" simulado aqui é um LOG COMPARTILHADO entre
 * múltiplos leitores — mesma semântica de instâncias serverless distintas:
 * nenhuma delas mantém estado local autoritativo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  type SimEvent = {
    conversationId: string;
    seq: number;
    type: string;
    source: string;
    payload: Record<string, unknown>;
    createdAt: string;
  };
  const state = {
    nextSeq: 1,
    simConversation: "22222222-2222-4222-8222-222222222222",
    failEventAppend: false,
    callOrder: [] as string[],
  };
  const log: SimEvent[] = [];
  return { state, log };
});

vi.mock("@/lib/events/appendConversationEvent", () => ({
  appendConversationEvent: vi.fn(async (input: {
    conversationId: string;
    type: string;
    source?: string;
    payload?: Record<string, unknown>;
    preview?: string;
  }) => {
    if (h.state.failEventAppend) {
      throw new Error("db indisponível nas provas");
    }
    const seq = h.state.nextSeq++;
    h.log.push({
      conversationId: input.conversationId,
      seq,
      type: input.type,
      source: input.source ?? "runtime",
      payload: input.payload ?? {},
      createdAt: new Date().toISOString(),
    });
    return { ok: true, seq };
  }),
  emitAction: vi.fn(async (opts: { conversationId: string; tool: string }) => {
    h.state.callOrder.push(`action:${opts.tool}`);
    const seq = h.state.nextSeq++;
    h.log.push({
      conversationId: opts.conversationId,
      seq,
      type: "action",
      source: "chat_build",
      payload: { tool: opts.tool },
      createdAt: new Date().toISOString(),
    });
    return { ok: true, seq };
  }),
  emitObservation: vi.fn(async (opts: { conversationId: string; tool: string }) => {
    h.state.callOrder.push(`observation:${opts.tool}`);
    const seq = h.state.nextSeq++;
    h.log.push({
      conversationId: opts.conversationId,
      seq,
      type: "observation",
      source: "chat_build",
      payload: { tool: opts.tool },
      createdAt: new Date().toISOString(),
    });
    return { ok: true, seq };
  }),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () =>
              h.log
                .filter((e) => e.conversationId === h.state.simConversation)
                .sort((a, b) => b.seq - a.seq)
                .slice(0, 10),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/runtime/model/client", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "@/lib/runtime/model/client";
import {
  getComputerController,
  isComputerActionAllowed,
  pickScreenFile,
  readControlFromEvents,
  releaseComputerControl,
  takeComputerControl,
  tryAcquireConversationBuild,
  releaseConversationBuild,
  COMPUTER_CONTROL_TTL_MS,
} from "../computer";
import { runChatBuildFlow } from "../buildRunner";
import { runFilesystem } from "@/lib/runtime/tools/filesystem";
import { dedupeBySeq, filterWorkEvents } from "@/lib/events/workEvents";
import { InMemoryStorage, setStorageBackend, resetStorage } from "@/lib/runtime/tools/storage";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONV_ID = "22222222-2222-4222-8222-222222222222";
const CONV_B = "33333333-3333-4333-8333-333333333333";

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

const textReply = (content: string) => ({
  content,
  toolProposal: null,
  provider: "local" as const,
  model: "test-model",
  usage: {},
  latencyMs: 1,
});

describe("Computador do Plutão — A..J", () => {
  beforeEach(() => {
    h.log.length = 0;
    h.state.nextSeq = 1;
    h.state.simConversation = CONV_ID;
    h.state.failEventAppend = false;
    h.state.callOrder = [];
    setStorageBackend(new InMemoryStorage());
  });

  afterEach(() => {
    resetStorage();
    vi.restoreAllMocks();
  });

  describe("A. controle humano compartilhado entre instâncias", () => {
    it("takeover grava no log durável e qualquer leitor ('outra instância') vê o mesmo controle", async () => {
      expect(await getComputerController(CONV_ID)).toBe("agent");

      await takeComputerControl(CONV_ID);

      // Leitor 1: consulta normal.
      expect(await getComputerController(CONV_ID)).toBe("human");

      // Leitor 2: "outra instância" — mesma leitura pura do MESMO log mutável.
      const rowsOfLog = h.log
        .filter((e) => e.conversationId === CONV_ID && e.source === "computer")
        .map((row) => ({
          type: row.type,
          source: row.source,
          payload: row.payload,
          createdAt: row.createdAt,
        }));
      expect(readControlFromEvents(rowsOfLog)).toBe("human");
      expect(await isComputerActionAllowed(CONV_ID)).toBe(true);
    });

    it("última escrita vence: release após takeover volta ao agente em qualquer leitor", async () => {
      await takeComputerControl(CONV_ID);
      await releaseComputerControl(CONV_ID);
      expect(await getComputerController(CONV_ID)).toBe("agent");
    });

    it("TTL: takeover humano expira para 'agent' (sem estado travado)", async () => {
      const at = Date.now() - COMPUTER_CONTROL_TTL_MS - 1000;
      const log = [{ type: "state_update", source: "computer", payload: { computer: true, controller: "human", at } }];
      expect(readControlFromEvents(log, Date.now())).toBe("agent");
    });

    it("TTL não afeta eventos 'agent' (default é seguro) e ignora eventos de outros emitters", () => {
      const log = [
        { type: "state_update", source: "computer", payload: { computer: true, controller: "agent", at: Date.now() - 90 * 60_000 } },
        { type: "state_update", source: "tool_dispatcher", payload: { computer: false } },
      ];
      expect(readControlFromEvents(log, Date.now())).toBe("agent");
    });
  });

  describe("B. takeover durante a chamada ao modelo — tool proposta NÃO executa", () => {
    it("agente não executa a tool proposta após assumirem o controle no meio da chamada", async () => {
      let calls = 0;
      mockedChatCompletion.mockImplementation(async () => {
        calls++;
        // Usuário assume o controle DURANTE (no início) da chamada ao modelo.
        await takeComputerControl(CONV_ID);
        return writeProposal("index.html");
      });

      const flow = await runChatBuildFlow({
        userId: USER_ID,
        conversationId: CONV_ID,
        userText: "crie um site de cafeteria",
        history: [],
        modelConfig,
      });

      expect(flow.executed).toBe(true);
      if (flow.executed) {
        expect(flow.pausedForHuman).toBe(true);
        expect(flow.steps).toHaveLength(0);
      }
      expect(calls).toBe(1);

      const list = await runFilesystem(
        JSON.stringify({ action: "list", payload: { path: "." } }),
        CONV_ID,
        USER_ID
      );
      expect(list.ok).toBe(true);
      if (!list.ok) throw new Error("falhou");
      const parsed = JSON.parse(list.output) as { entries: Array<{ name: string }> };
      expect(parsed.entries).toHaveLength(0);
    });
  });

  describe("C. takeover durante a ferramenta em andamento", () => {
    it("a tool em voo conclui (com observation gravada) e NADA mais executa", async () => {
      let calls = 0;
      mockedChatCompletion.mockImplementation(async () => {
        calls++;
        if (calls === 1) return writeProposal("index.html");
        return writeProposal("index2.html");
      });

      const flow = await runChatBuildFlow({
        userId: USER_ID,
        conversationId: CONV_ID,
        userText: "crie um sistema para sorveteria",
        history: [],
        modelConfig,
        onStep: () => {
          // O usuário assume enquanto nos aproximamos da fronteira de passo.
          void takeComputerControl(CONV_ID);
        },
      });

      expect(flow.executed).toBe(true);
      if (flow.executed) {
        expect(flow.pausedForHuman).toBe(true);
        expect(flow.steps).toHaveLength(1);
        expect(flow.steps[0]!.ok).toBe(true);
      }
      // A segunda chamada ao modelo nunca acontece: a checagem no topo da
      // iteração seguinte detecta o controle humano e interrompe o loop antes.
      expect(calls).toBe(1);

      // observation do passo em voo foi gravada ANTES da pausa (ordem real).
      const observations = h.log.filter((e) => e.type === "observation");
      expect(observations).toHaveLength(1);

      // A segunda tool proposta não executou.
      const list = await runFilesystem(
        JSON.stringify({ action: "list", payload: { path: "." } }),
        CONV_ID,
        USER_ID
      );
      if (!list.ok) throw new Error("falhou");
      const parsed = JSON.parse(list.output) as { entries: Array<{ name: string }> };
      const names = parsed.entries.map((e) => e.name);
      expect(names).toContain("index.html");
      expect(names).not.toContain("index2.html");
    });
  });

  describe("D. nenhuma ação do agente enquanto o humano controla", () => {
    it("fluxo iniciado sob controle humano não chama o modelo nem executa tools", async () => {
      await takeComputerControl(CONV_ID);
      let calls = 0;
      mockedChatCompletion.mockImplementation(async () => {
        calls++;
        return writeProposal("index.html");
      });

      const flow = await runChatBuildFlow({
        userId: USER_ID,
        conversationId: CONV_ID,
        userText: "crie um site de cafeteria",
        history: [],
        modelConfig,
      });

      expect(flow.executed).toBe(true);
      if (flow.executed) {
        expect(flow.pausedForHuman).toBe(true);
        expect(flow.steps).toHaveLength(0);
      }
      expect(calls).toBe(0);
    });

    it("guard já pronto para a rota /action: sem controle humano, ação é proibida", async () => {
      expect(await isComputerActionAllowed(CONV_ID)).toBe(false);
      expect(await isComputerActionAllowed(null)).toBe(false);
      expect(await isComputerActionAllowed(undefined)).toBe(false);
    });

    it("lock por conversa impede dois fluxos paralelos da mesma conversa", () => {
      expect(tryAcquireConversationBuild(CONV_ID)).toBe(true);
      expect(tryAcquireConversationBuild(CONV_ID)).toBe(false);
      releaseConversationBuild(CONV_ID);
      expect(tryAcquireConversationBuild(CONV_ID)).toBe(true);
      releaseConversationBuild(CONV_ID);
    });
  });

  describe("E. devolução e retomada do agente", () => {
    it("após release, novo fluxo executa tools normalmente", async () => {
      await takeComputerControl(CONV_ID);
      await releaseComputerControl(CONV_ID);

      let calls = 0;
      mockedChatCompletion.mockImplementation(async () => {
        calls++;
        if (calls === 1) return writeProposal("index.html");
        return textReply("Criação concluída.");
      });

      const flow = await runChatBuildFlow({
        userId: USER_ID,
        conversationId: CONV_ID,
        userText: "continue a criação",
        history: [],
        modelConfig,
      });

      expect(flow.executed).toBe(true);
      if (flow.executed) {
        expect(flow.pausedForHuman).toBeUndefined();
        expect(flow.steps).toHaveLength(1);
        expect(flow.steps[0]!.ok).toBe(true);
      }
      expect(calls).toBe(2);
    });
  });

  describe("F. reconexão e recuperação de eventos", () => {
    it("dedupeBySeq: eventos re-entregues no replay não duplicam", () => {
      const evs = [
        { seq: 1, type: "action" },
        { seq: 2, type: "observation" },
        { seq: 2, type: "observation" },
        { seq: 3, type: "state_update" },
        { seq: 1, type: "action" },
      ];
      const out = dedupeBySeq(evs);
      expect(out.map((e) => e.seq)).toEqual([1, 2, 3]);
    });

    it("ordem de gravação action → observation por etapa (seq crescente)", async () => {
      let calls = 0;
      mockedChatCompletion.mockImplementation(async () => {
        calls++;
        if (calls === 1) return writeProposal("index.html");
        return textReply("Pronto.");
      });

      const flow = await runChatBuildFlow({
        userId: USER_ID,
        conversationId: CONV_ID,
        userText: "crie um site de cafe",
        history: [],
        modelConfig,
      });

      expect(flow.executed).toBe(true);
      const work = h.log.filter((e) => filterWorkEvents([e]).length > 0);
      const types = work.filter((e) => e.type !== "state_update").map((e) => e.type);
      expect(types).toEqual(["action", "observation"]);
    });

    it("falha ao gravar evento NÃO quebra o fluxo nem a tool (best-effort)", async () => {
      h.state.failEventAppend = true;
      let calls = 0;
      mockedChatCompletion.mockImplementation(async () => {
        calls++;
        if (calls === 1) return writeProposal("index.html");
        return textReply("Pronto.");
      });

      const flow = await runChatBuildFlow({
        userId: USER_ID,
        conversationId: CONV_ID,
        userText: "crie um site de cafeteria",
        history: [],
        modelConfig,
      });

      expect(flow.executed).toBe(true);
      if (flow.executed) {
        expect(flow.steps).toHaveLength(1);
        expect(flow.steps[0]!.ok).toBe(true);
      }
    });
  });

  describe("G. navegador Chromium real", () => {
    it("NÃO implementado nesta fase: nenhuma API simula VNC/screenshot — ver docs", async () => {
      // Guard documental: a única coisa exposta é a tela real do sandbox.
      // pickScreenFile é determinístico e honesto (null quando não há HTML).
      expect(pickScreenFile([])).toBeNull();
      expect(pickScreenFile([{ name: "src", type: "directory" }])).toBeNull();
    });
  });

  describe("H. isolamento entre conversas e usuários", () => {
    it("controles de conversas diferentes são independentes", async () => {
      await takeComputerControl(CONV_ID);
      h.state.simConversation = CONV_B;
      expect(await getComputerController(CONV_B)).toBe("agent");
      h.state.simConversation = CONV_ID;
      expect(await getComputerController(CONV_ID)).toBe("human");
    });

    it("arquivos isolados por conversa (sandbox por conversationId)", async () => {
      const { dispatchChatBuildTool } = await import("../buildRunner");
      await dispatchChatBuildTool({
        name: "filesystem",
        input: JSON.stringify({
          action: "write",
          payload: { path: "index.html", content: "<h1>A</h1>" },
        }),
        userId: USER_ID,
        conversationId: CONV_ID,
      });
      const listB = await dispatchChatBuildTool({
        name: "filesystem",
        input: JSON.stringify({ action: "list", payload: { path: "." } }),
        userId: USER_ID,
        conversationId: CONV_B,
      });
      if (!listB.ok) throw new Error("falhou");
      const parsed = JSON.parse(listB.output) as { entries: Array<{ name: string }> };
      expect(parsed.entries.some((e) => e.name === "index.html")).toBe(false);
    });
  });
});
