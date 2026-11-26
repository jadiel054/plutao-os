/**
 * Fases 1+4+5 — testes do GERENCIADOR DE SESSÕES com provedor FALSO (MOCK).
 *
 * O que este suite prova (lógica do control plane, sem rede):
 *   A. criar e encerrar sessão
 *   B. bloquear segunda sessão simultânea (inclusive na janela de reserva)
 *   C. impedir acesso de outra conversa/usuário à sessão
 *   F. impedir controle simultâneo (CAS agente × humano, DURÁVEL no store)
 *   H. bloquear novas sessões ao esgotar a cota gratuita (conta DURÁVEL)
 *   I. NAO vazar credenciais/segredos na view e na info de conexão
 *   J. trocar o provedor sem alterar o Chat (browserless → self-hosted)
 *
 * Semântica do store durável entre instâncias: store.test.ts (dois
 * gerenciadores compartilhando o MESMO store = duas instâncias Vercel).
 *
 * Cobertura REAL de rede/Chromium: apps/web/src/lib/computer/__tests__/
 * browserlessIntegration.test.ts (roda só com BROWSERLESS_API_TOKEN).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  ComputerSessionManager,
  type SessionView,
} from "../sessionManager";
import { MemorySessionStore } from "../store";
import {
  ComputerProviderError,
  type ComputerBrowserAction,
  type ComputerConnectionInfo,
  type ComputerController,
  type ComputerProvider,
  type ComputerScreenFrame,
  type ComputerSession,
  type ComputerSessionSnapshot,
  type CreateSessionOptions,
} from "../provider";

const NOW = 1_700_000_000_000;

class FakeRemoteSession implements ComputerSession {
  readonly id: string;
  readonly provider: ComputerProviderKindFake;
  status: ComputerSessionSnapshot["status"] = "ready";
  controller: ComputerController = "agent";
  closed = false;
  executed: ComputerBrowserAction[] = [];
  private listener: ((f: ComputerScreenFrame) => void) | null = null;
  lastFrame: ComputerScreenFrame | null = null;
  createdAt = NOW;
  leaseExpiresAt = NOW + 110_000;
  lastSeenAt = NOW;
  unitsUsed = 0;
  error: string | null = null;
  readonly conversationId: string;
  readonly userId: string;
  onControllerTakenByAgent: (() => void)[] = [];

  constructor(
    readonly counter: Counters,
    kind: ComputerProviderKindFake,
    conversationId: string,
    userId: string,
    durableId?: string
  ) {
    const n = ++counter.created;
    this.id = durableId ?? `fake-${n}`;
    this.provider = kind;
    this.conversationId = conversationId;
    this.userId = userId;
    this.counter.open++;
  }

  snapshot(): ComputerSessionSnapshot {
    return {
      sessionId: this.id,
      provider: this.provider,
      status: this.closed ? "closed" : this.status,
      controller: this.controller,
      createdAt: this.createdAt,
      leaseExpiresAt: this.leaseExpiresAt,
      lastSeenAt: this.lastSeenAt,
      unitsUsed: this.unitsUsed,
      error: this.error,
    };
  }

  connectionInfo(screenEndpoint: string, inputEndpoint: string): ComputerConnectionInfo {
    return {
      sessionId: this.id,
      provider: this.provider,
      status: this.snapshot().status,
      controller: this.controller,
      screenTransport: "sse-screencast-proxy",
      screenEndpoint,
      inputEndpoint,
    };
  }

  compareAndSetController(from: ComputerController, to: ComputerController): boolean {
    if (this.controller !== from) return false;
    this.controller = to;
    return true;
  }

  async executeAction(action: ComputerBrowserAction): Promise<void> {
    if (this.controller !== "human") {
      throw new ComputerProviderError("NOT_AUTHORIZED", "agente não é dono do navegador nesta fase");
    }
    this.executed.push(action);
  }

  subscribeScreen(listener: (frame: ComputerScreenFrame) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  getLastFrame(): ComputerScreenFrame | null {
    return this.lastFrame;
  }

  emitFrame(): void {
    const frame = { data: "ZmFrZQ==", width: 1280, height: 720, capturedAt: Date.now() };
    this.lastFrame = frame;
    this.listener?.(frame);
  }

  async reconnect(): Promise<void> {
    if (this.controller === "human") {
      throw new ComputerProviderError("PROVIDER_UNAVAILABLE", "bloqueada durante controle humano");
    }
    this.status = "reconnecting";
    this.counter.reconnects++;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.counter.closed++;
  }
}

type ComputerProviderKindFake = "browserless" | "self-hosted";

type Counters = { created: number; open: number; closed: number; reconnects: number; sessions: FakeRemoteSession[] };

function fakeProviderFactory(
  counter: Counters,
  kind: ComputerProviderKindFake,
  options: { configured?: boolean; failOpen?: ComputerProviderError } = {}
) {
  return (): ComputerProvider => ({
    kind,
    isConfigured: () => options.configured ?? true,
    limits: () => ({
      maxSessionMs: 110_000,
      maxConcurrentSessions: 1,
      monthlyBudgetUnits: kind === "browserless" ? 1000 : Number.POSITIVE_INFINITY,
      notes: kind === "browserless" ? ["Free: sessão de 2 min"] : ["sem provedor externo"],
    }),
    createSession: ({ conversationId, userId, sessionId }: CreateSessionOptions) => {
      if (options.failOpen) return Promise.reject(options.failOpen);
      const session = new FakeRemoteSession(counter, kind, conversationId, userId, sessionId);
      counter.sessions.push(session);
      return Promise.resolve(session);
    },
  });
}

function makeManager(
  counter: Counters,
  kind: ComputerProviderKindFake = "browserless",
  options: { configured?: boolean; failOpen?: ComputerProviderError; now?: () => number } = {}
): ComputerSessionManager {
  const now = options.now ?? (() => NOW);
  return new ComputerSessionManager({
    now,
    providerFactory: fakeProviderFactory(counter, kind, options),
    store: new MemorySessionStore({ now }),
  });
}

const COUNTERS_FREE = { created: 0, open: 0, closed: 0, reconnects: 0, sessions: [] as FakeRemoteSession[] };

describe("Computador do Plutão — gerenciador de sessões (fase 3+4)", () => {
  beforeEach(() => {
    COUNTERS_FREE.created = 0;
    COUNTERS_FREE.open = 0;
    COUNTERS_FREE.closed = 0;
    COUNTERS_FREE.reconnects = 0;
    COUNTERS_FREE.sessions = [];
  });

  describe("A. criar e encerrar uma sessão", () => {
    it("reserva → ativa à conversa/usuário → encerra de verdade", async () => {
      const mgr = makeManager(COUNTERS_FREE);
      const res = await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      expect(res.ok).toBe(true);
      expect(mgr.activeFor("conv-1", "user-1")?.id).toBe(res.ok ? res.session.id : null);
      const view = mgr.view("conv-1", "user-1");
      expect(view.status).toBe("ready");
      expect(view.controller).toBe("agent");

      const closed = await mgr.closeConversation("conv-1", "user-1");
      expect(closed).toBe(true);
      expect(mgr.activeFor("conv-1", "user-1")).toBeNull();
      expect(mgr.view("conv-1", "user-1").status).toBe("offline");
      expect(COUNTERS_FREE.sessions[0]!.closed).toBe(true);
    });
  });

  describe("B. bloquear uma segunda sessão simultânea", () => {
    it("recusa reserva enquanto a primeira está ativa", async () => {
      const mgr = makeManager(COUNTERS_FREE);
      await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      const second = await mgr.reserve({ conversationId: "conv-2", userId: "user-2" });
      expect(second).toEqual({ ok: false, reason: "SESSION_LIMIT" });
      expect(COUNTERS_FREE.created).toBe(1);
    });

    it("fecha a janela de corrida durante a criação (reserving)", async () => {
      let releaseOpen: (() => void) | null = null;
      const gate = new Promise<void>((resolve) => {
        releaseOpen = resolve;
      });
      const counter = { created: 0, open: 0, closed: 0, reconnects: 0, sessions: [] as FakeRemoteSession[] };
      const slowProvider: ComputerProvider = {
        kind: "browserless",
        isConfigured: () => true,
        limits: () => ({ maxSessionMs: 110_000, maxConcurrentSessions: 1, monthlyBudgetUnits: 1000, notes: [] }),
        createSession: async () => {
          await gate;
          const s = new FakeRemoteSession(counter, "browserless", "conv-1", "user-1");
          counter.sessions.push(s);
          return s;
        },
      };
      const mgr = new ComputerSessionManager({ providerFactory: () => slowProvider, store: new MemorySessionStore({ now: () => NOW }) });
      const first = mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mgr.isReserving()).toBe(true);
      const racing = await mgr.reserve({ conversationId: "conv-2", userId: "user-2" });
      expect(racing).toEqual({ ok: false, reason: "SESSION_LIMIT" });
      releaseOpen!();
      expect((await first).ok).toBe(true);
    });
  });

  describe("C. impedir acesso de outra conversa à sessão", () => {
    it("sessão só responde ao dono; estranho não vê nem controla", async () => {
      const mgr = makeManager(COUNTERS_FREE);
      const res = await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      expect(res.ok).toBe(true);

      expect(mgr.activeFor("conv-2", "user-1")).toBeNull();
      expect(mgr.activeFor("conv-1", "user-2")).toBeNull();

      const intruder = mgr.view("conv-2", "user-1");
      expect(intruder.sessionId).toBeNull();
      expect(intruder.status).toBe("offline");
      expect(intruder.activeElsewhere).toBe(true);

      const closed = await mgr.closeConversation("conv-2", "user-1");
      expect(closed).toBe(false);
      const closedByOtherUser = await mgr.closeConversation("conv-1", "user-2");
      expect(closedByOtherUser).toBe(false);
      expect(mgr.activeFor("conv-1", "user-1")).not.toBeNull();
    });
  });

  describe("D+E. agente pausa e retoma (fonte da verdade da sessão)", () => {
    it("isHumanInControlFor: false com agente; true no controle humano; false após devolver", async () => {
      const mgr = makeManager(COUNTERS_FREE);
      await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      expect(mgr.isHumanInControlFor("conv-1", "user-1")).toBe(false);

      expect((await mgr.takeHumanControl("conv-1", "user-1")).ok).toBe(true);
      expect(mgr.isHumanInControlFor("conv-1", "user-1")).toBe(true);

      expect((await mgr.releaseToAgent("conv-1", "user-1")).ok).toBe(true);
      expect(mgr.isHumanInControlFor("conv-1", "user-1")).toBe(false);
    });
  });

  describe("F. impedir controle simultâneo (CAS exclusivo)", () => {
    it("segundo takeover perde a corrida (fallback sem sessão não rouba)", async () => {
      const mgr = makeManager(COUNTERS_FREE);
      await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      const session = mgr.activeFor("conv-1", "user-1")!;
      const first = await mgr.takeHumanControl("conv-1", "user-1");
      expect(first.ok).toBe(true);
      // No segundo takeover PERDE a corrida — por CAS durável OU pelo próprio
      // objeto local (que é só réplica do plano durável).
      const secondTake = await mgr.takeHumanControl("conv-1", "user-1");
      const stealer = session.compareAndSetController("agent", "human");
      expect(secondTake.ok).toBe(false);
      expect(stealer).toBe(false);
      expect(session.snapshot().controller).toBe("human");

      const release = await mgr.releaseToAgent("conv-1", "user-1");
      expect(release.ok).toBe(true);
      const secondRelease = await mgr.releaseToAgent("conv-1", "user-1");
      expect(secondRelease.ok).toBe(false);
    });
  });

  describe("G. desconexão e reconexão (estado do provedor)", () => {
    it("reconecta com agente no controle; recusa durante controle humano", async () => {
      const mgr = makeManager(COUNTERS_FREE);
      await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      const session = mgr.activeFor("conv-1", "user-1") as FakeRemoteSession;

      session.status = "reconnecting";
      await session.reconnect();
      expect(COUNTERS_FREE.reconnects).toBe(1);

      await mgr.takeHumanControl("conv-1", "user-1");
      await expect(session.reconnect()).rejects.toMatchObject({
        reason: "PROVIDER_UNAVAILABLE",
      });
    });
  });

  describe("H. bloquear novas sessões ao esgotar a cota gratuita", () => {
    it("QUOTA_EXHAUSTED quando unidades >= orçamento; sem cobrança extra", async () => {
      const mgr = makeManager(COUNTERS_FREE);
      const first = await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      expect(first.ok).toBe(true);
      const session = mgr.activeFor("conv-1", "user-1") as FakeRemoteSession;
      // Consumo equivalente a TODO o orçamento gratuito (1.000 unidades).
      session.createdAt = NOW - 1000 * 30_000;

      const second = await mgr.reserve({ conversationId: "conv-2", userId: "user-1" });
      expect(second).toEqual({ ok: false, reason: "SESSION_LIMIT" });
      await mgr.closeConversation("conv-1", "user-1");
      // Orçamento consumido: novas reservas bloqueadas MESMO sem sessão ativa.
      const afterClose = await mgr.reserve({ conversationId: "conv-2", userId: "user-1" });
      expect(afterClose).toEqual({ ok: false, reason: "QUOTA_EXHAUSTED" });
      expect(COUNTERS_FREE.created).toBe(1);
    });
  });

  describe("I. não expor credenciais no frontend, logs ou eventos", () => {
    it("view e connectionInfo NÃO contêm token/host/URL do provedor", async () => {
      const mgr = makeManager(COUNTERS_FREE);
      await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      const serialized = (value: unknown) => JSON.stringify(value);
      const view: SessionView = mgr.view("conv-1", "user-1");
      expect(serialized(view)).not.toMatch(/token|wss:|browserless\.io|Endpoint/i);
      const info = mgr.connectionInfoFor("conv-1", "user-1");
      expect(info).not.toBeNull();
      expect(serialized(info)).not.toMatch(/token|wss:|browserless\.io/i);
      expect(info!.screenEndpoint).toBe("/api/computer/conv-1/screen/stream");
      expect(info!.inputEndpoint).toBe("/api/computer/conv-1/session/input");
    });

    it("view de queda de configuração não imprime segredo", () => {
      const counter = COUNTERS_FREE;
      const mgr = makeManager(counter, "browserless", { configured: false });
      const view = mgr.view();
      expect(view.error).toContain("token");
      expect(view.error).not.toMatch(/wss:|browserless\.io/);
    });
  });

  describe("J. a abstração permite substituir Browserless por self-hosted", () => {
    it("mesmo contrato com provedor 'self-hosted' — Chat não muda", async () => {
      const counter = { created: 0, open: 0, closed: 0, reconnects: 0, sessions: [] as FakeRemoteSession[] };
      const mgr = makeManager(counter, "self-hosted");
      const res = await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      expect(res.ok).toBe(true);
      const view = mgr.view("conv-1", "user-1");
      expect(view.provider).toBe("self-hosted");
      expect(view.limits.notes.join(" ")).not.toContain("Browserless");
      await mgr.closeConversation("conv-1", "user-1");
    });

    it("fail-closed: provedor mal configurado recusa criação", async () => {
      const counter = COUNTERS_FREE;
      const mgr = makeManager(counter, "browserless", { configured: false });
      const res = await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      expect(res).toEqual({ ok: false, reason: "PROVIDER_UNCONFIGURED" });
      expect(counter.created).toBe(0);
    });

    it("PROVIDER_UNAVAILABLE por conexão do provedor é assumido como indisponível", async () => {
      const counter = COUNTERS_FREE;
      const mgr = makeManager(counter, "browserless", {
        failOpen: new ComputerProviderError("PROVIDER_UNAVAILABLE", "dns falhou"),
      });
      const res = await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      expect(res).toEqual({ ok: false, reason: "PROVIDER_UNAVAILABLE" });
    });
  });

  describe("expiração de sessões abandonadas (lease)", () => {
    it("sessão sem lease novo some da lista ativa", async () => {
      let now = NOW;
      const counter = COUNTERS_FREE;
      const mgr = new ComputerSessionManager({ now: () => now, providerFactory: fakeProviderFactory(counter, "browserless"), store: new MemorySessionStore({ now: () => now }) });
      await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
      expect(mgr.activeFor("conv-1", "user-1")).not.toBeNull();
      now += 200_000; // > lease + tolerância
      expect(mgr.activeFor("conv-1", "user-1")).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(counter.closed).toBe(1);
    });
  });
});
