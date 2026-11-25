/**
 * CONTROL PLANE DURÁVEL — semânticas do SessionStore e execução CROSS-INSTANCE.
 *
 * O que este suite prova (sem rede): as mesmas garantias que o SQL do Neon
 * dá por índice único parcial/CAS, exercitadas aqui via MemorySessionStore —
 * com DOIS gerenciadores compartilhando UM store (equivalente a duas
 * instâncias Vercel distintas apontando para o mesmo Neon).
 */
import { describe, expect, it } from "vitest";
import type { Db } from "@plutao/db";
import { CHANNEL_LEASE_MS, HUMAN_ACTION_TTL_MS, MemorySessionStore, PersistenceUnavailableError, ResilientSessionStore, type SessionRecord } from "../store";
import { ComputerSessionManager } from "../sessionManager";
import type { ComputerProvider } from "../provider";

const NOW = 1_700_000_000_000;

type Counters = { created: number; open: number; sessions: FakeSession[] };

class FakeSession {
  readonly id: string;
  readonly provider = "browserless" as const;
  status = "ready" as const;
  controller = "agent" as "agent" | "human";
  closed = false;
  createdAt = NOW;
  leaseExpiresAt = NOW + 110_000;
  lastSeenAt = NOW;
  unitsUsed = 0;
  error: string | null = null;
  constructor(
    id: string,
    readonly conversationId: string,
    readonly userId: string
  ) {
    this.id = id;
  }
  snapshot() {
    return {
      sessionId: this.id,
      provider: this.provider,
      status: this.status,
      controller: this.controller,
      createdAt: this.createdAt,
      leaseExpiresAt: this.leaseExpiresAt,
      lastSeenAt: this.lastSeenAt,
      unitsUsed: this.unitsUsed,
      error: this.error,
    };
  }
  connectionInfo(screenEndpoint: string, inputEndpoint: string) {
    return { sessionId: this.id, provider: this.provider, status: this.status, controller: this.controller, screenTransport: "sse-screencast-proxy" as const, screenEndpoint, inputEndpoint };
  }
  compareAndSetController(from: "agent" | "human", to: "agent" | "human") {
    if (this.controller !== from) return false;
    this.controller = to;
    return true;
  }
  async executeAction() {}
  subscribeScreen() {
    return () => undefined;
  }
  getLastFrame() {
    return null;
  }
  async reconnect() {}
  async close() {}
}

function fakeProvider(counter: Counters) {
  return (): ComputerProvider => ({
    kind: "browserless",
    isConfigured: () => true,
    limits: () => ({ maxSessionMs: 110_000, maxConcurrentSessions: 1, monthlyBudgetUnits: 1000, notes: [] }),
    createSession: ({ conversationId, userId, sessionId }) => {
      const session = new FakeSession(sessionId ?? `fake-${counter.created + 1}`, conversationId, userId);
      counter.created += 1;
      counter.open += 1;
      counter.sessions.push(session);
      return Promise.resolve(session);
    },
  });
}

describe("MemorySessionStore — semânticas duráveis (espelha o SQL do Neon)", () => {
  it("gate de reserva: só UMA linha viva por instalação, qualquer status", async () => {
    const store = new MemorySessionStore({ now: () => NOW });
    const base = { conversationId: "c1", userId: "u1", provider: "browserless" as const, leaseExpiresAt: NOW + 110_000, monthlyBudgetUnits: 1000 };
    expect(await store.tryReserve({ ...base, sessionId: "s1" })).toEqual({ ok: true });
    expect(await store.tryReserve({ ...base, sessionId: "s2" })).toEqual({ ok: false, reason: "SESSION_LIMIT" });

    // Mesmo em "reconnecting" (status vivo) a recusa se mantém — o gate é
    // por linha viva (closed_at IS NULL), NÃO por status.
    await store.renew("s1", { status: "reconnecting" });
    expect(await store.tryReserve({ ...base, sessionId: "s3" })).toEqual({ ok: false, reason: "SESSION_LIMIT" });

    await store.close("s1", "closed");
    expect(await store.tryReserve({ ...base, sessionId: "s4" })).toEqual({ ok: true });
  });

  it("cota mensal DURÁVEL: unidades por sessão bloqueiam a reserva seguinte", async () => {
    const store = new MemorySessionStore({ now: () => NOW });
    const base = { conversationId: "c1", userId: "u1", provider: "browserless" as const, leaseExpiresAt: NOW + 110_000, monthlyBudgetUnits: 10 };
    expect(await store.tryReserve({ ...base, sessionId: "s1" })).toEqual({ ok: true });
    await store.renew("s1", { unitsUsed: 10 });
    await store.close("s1", "closed");
    expect(await store.monthlyUnitsUsed(new Date(NOW).toISOString().slice(0, 7))).toBe(10);
    expect(await store.tryReserve({ ...base, sessionId: "s2" })).toEqual({ ok: false, reason: "QUOTA_EXHAUSTED" });
  });

  it("CAS do controle com guarda de ação humana em andamento", async () => {
    let now = NOW;
    const store = new MemorySessionStore({ now: () => now });
    const base = { conversationId: "c1", userId: "u1", provider: "browserless" as const, leaseExpiresAt: NOW + 110_000, monthlyBudgetUnits: 1000 };
    await store.tryReserve({ ...base, sessionId: "s1" });

    expect(await store.setHumanActionInflight("s1", now + HUMAN_ACTION_TTL_MS, "act-a")).toBe(false);
    expect(await store.casController("s1", "agent", "human")).toBe(true);
    expect(await store.setHumanActionInflight("s1", now + HUMAN_ACTION_TTL_MS, "act-a")).toBe(true);
    expect(await store.setHumanActionInflight("s1", now + HUMAN_ACTION_TTL_MS, "act-b")).toBe(false);
    // Devolução RECUSADA enquanto a ação executa (input não sobrevive à troca).
    expect(await store.casController("s1", "human", "agent")).toBe(false);
    now += HUMAN_ACTION_TTL_MS + 1; // TTL auto-libera (crash da request)
    expect(await store.casController("s1", "human", "agent")).toBe(true);
  });

  it("canal vivo: BUSY com dono válido; assume quando o lease do dono expira", async () => {
    let now = NOW;
    const store = new MemorySessionStore({ now: () => now });
    const base = { conversationId: "c1", userId: "u1", provider: "browserless" as const, leaseExpiresAt: NOW + 110_000, monthlyBudgetUnits: 1000 };
    await store.tryReserve({ ...base, sessionId: "s1" });

    expect(await store.attachChannel("s1", "inst-A", CHANNEL_LEASE_MS)).toBe("ok");
    expect(await store.attachChannel("s1", "inst-B", CHANNEL_LEASE_MS)).toBe("BUSY");
    expect(await store.renewChannel("s1", "inst-B", CHANNEL_LEASE_MS)).toBe(false);
    expect(await store.renewChannel("s1", "inst-A", CHANNEL_LEASE_MS)).toBe(true);

    now += CHANNEL_LEASE_MS + 1;
    expect(await store.attachChannel("s1", "inst-B", CHANNEL_LEASE_MS)).toBe("ok");
  });

  it("sweep: sessão com lease vencido expira e LIBERA o gate único", async () => {
    let now = NOW;
    const store = new MemorySessionStore({ now: () => now });
    const base = { conversationId: "c1", userId: "u1", provider: "browserless" as const, leaseExpiresAt: NOW + 110_000, monthlyBudgetUnits: 1000 };
    await store.tryReserve({ ...base, sessionId: "s1" });
    now += 110_000 + 5_000 + 1; // lease + tolerância de expiração
    expect(await store.sweepExpired()).toBe(1);
    const rec = await store.get("s1");
    expect(rec?.status).toBe("expired");
    expect(rec?.closedAt).not.toBeNull();
    expect(await store.tryReserve({ ...base, sessionId: "s2" })).toEqual({ ok: true });
  });
});

describe("Execução cross-instance — dois gerenciadores, um store (Neon lógico)", () => {
  const base = { conversationId: "conv-1", userId: "user-1" };

  function twoManagers(now: () => number) {
    const counterA: Counters = { created: 0, open: 0, sessions: [] };
    const counterB: Counters = { created: 0, open: 0, sessions: [] };
    const store = new MemorySessionStore({ now });
    const a = new ComputerSessionManager({ now, providerFactory: fakeProvider(counterA), store, channelInstance: "inst-A" });
    const b = new ComputerSessionManager({ now, providerFactory: fakeProvider(counterB), store, channelInstance: "inst-B" });
    return { a, b, store };
  }

  it("B NÃO cria segunda sessão: o gate é o INSERT no store, não memória local", async () => {
    const { a, b, store } = twoManagers(() => NOW);
    const first = await a.reserve(base);
    expect(first.ok).toBe(true);
    const racing = await b.reserve({ conversationId: "conv-2", userId: "user-2" });
    expect(racing).toEqual({ ok: false, reason: "SESSION_LIMIT" });
    expect(store.describe()).toEqual({ mode: "memory", degraded: false });
  });

  it("controller é DURÁVEL: takeover na instância B é visto pela instância A", async () => {
    const { a, b } = twoManagers(() => NOW);
    await a.reserve(base);

    expect(await b.isHumanInControlDurable("conv-1", "user-1")).toBe(false);
    expect((await b.takeHumanControl("conv-1", "user-1")).ok).toBe(true);
    expect(await a.isHumanInControlDurable("conv-1", "user-1")).toBe(true);

    expect((await a.releaseToAgent("conv-1", "user-1")).ok).toBe(true);
    expect(await b.isHumanInControlDurable("conv-1", "user-1")).toBe(false);
  });

  it("devolução recusada durante ação humana; após endHumanAction devolve", async () => {
    const { a, b } = twoManagers(() => NOW);
    await a.reserve(base);
    expect((await a.takeHumanControl("conv-1", "user-1")).ok).toBe(true);

    const begin = await a.beginHumanAction("conv-1", "user-1");
    if (!begin.ok) throw new Error("ação humana deveria começar");
    expect(await b.releaseToAgent("conv-1", "user-1")).toMatchObject({ ok: false, reason: "ACTION_INFLIGHT" });

    await a.endHumanAction(begin.session.id, begin.actionId);
    expect((await b.releaseToAgent("conv-1", "user-1")).ok).toBe(true);
  });

  it("sessão fechada por OUTRA instância fica offline de verdade (control plane)", async () => {
    const { a, b, store } = twoManagers(() => NOW);
    await a.reserve(base);
    expect(await b.closeConversation("conv-1", "user-1")).toBe(true);
    expect(await store.findLiveByConversation("conv-1")).toBeNull();
    expect(await b.isHumanInControlDurable("conv-1", "user-1")).toBe(false);
  });

  it("re-attach cross-instance: após o lease do canal expirar, B assume com o MESMO id durável", async () => {
    let now = NOW;
    const counterB: Counters = { created: 0, open: 0, sessions: [] };
    const counterA: Counters = { created: 0, open: 0, sessions: [] };
    const store = new MemorySessionStore({ now: () => now });
    const a = new ComputerSessionManager({ now: () => now, providerFactory: fakeProvider(counterA), store, channelInstance: "inst-A" });
    const b = new ComputerSessionManager({ now: () => now, providerFactory: fakeProvider(counterB), store, channelInstance: "inst-B" });
    const first = await a.reserve(base);
    if (!first.ok) throw new Error("reserva inicial falhou");
    const durableId = first.session.id;

    now += 110_000 + 1; // sessão e canal da instância A vencem
    const reattached = await b.ensureSession("conv-1", "user-1");
    expect(reattached).not.toBeNull();
    expect(reattached!.id).toBe(durableId);
    expect(counterB.created).toBe(1); // navegador novo (Free) MESMO id durável
  });

  it("ResilientSessionStore degrada para memória quando o cliente db não suporta execute", async () => {
    const brokenDb = {} as unknown as Db;
    const store = new ResilientSessionStore(() => brokenDb, new MemorySessionStore({ now: () => NOW }));

    expect(await store.findLiveByConversation("conv-1")).toBeNull();
    expect(
      await store.tryReserve({
        sessionId: "s-r1",
        conversationId: "conv-1",
        userId: "user-1",
        provider: "browserless",
        leaseExpiresAt: NOW + 110_000,
        monthlyBudgetUnits: 1000,
      })
    ).toMatchObject({ ok: true });
    expect(store.describe()).toEqual({ mode: "memory", degraded: true });
  });
});

describe("Fail-closed em produção — allowDegraded=false", () => {
  const reserveInput = {
    sessionId: "s1",
    conversationId: "c1",
    userId: "u1",
    provider: "browserless" as const,
    leaseExpiresAt: NOW + 110_000,
    monthlyBudgetUnits: 1000,
  };

  it("DATABASE_URL ausente → PersistenceUnavailableError (NUNCA fallback memória)", async () => {
    const store = new ResilientSessionStore(
      () => {
        throw new Error("DATABASE_URL is not set");
      },
      new MemorySessionStore(),
      false
    );
    await expect(store.tryReserve(reserveInput)).rejects.toBeInstanceOf(PersistenceUnavailableError);
    await expect(store.get("s1")).rejects.toBeInstanceOf(PersistenceUnavailableError);
    expect(store.describe()).toEqual({ mode: "neon", degraded: false });
  });

  it("cliente DB indisponível (execute inexistente) → PersistenceUnavailableError no método selecionado", async () => {
    const store = new ResilientSessionStore(() => ({}) as unknown as Db, new MemorySessionStore(), false);
    await expect(store.tryReserve(reserveInput)).rejects.toBeInstanceOf(PersistenceUnavailableError);
    expect(store.describe()).toEqual({ mode: "neon", degraded: false });
  });

  it("tabela ausente (42P01) pelo Resilient → PersistenceUnavailableError SEM usar memória e SEM marcar degradado", async () => {
    const fallback = new MemorySessionStore();
    const factory = () => {
      const error = new Error('relation "computer_sessions" does not exist') as Error & { code?: string };
      error.code = "42P01";
      throw error;
    };
    const store = new ResilientSessionStore(factory as unknown as () => Db, fallback, false);
    await expect(store.tryReserve(reserveInput)).rejects.toBeInstanceOf(PersistenceUnavailableError);
    await expect(store.get("s1")).rejects.toBeInstanceOf(PersistenceUnavailableError);
    expect(await fallback.get("s1")).toBeNull();
    expect(store.describe()).toEqual({ mode: "neon", degraded: false });
  });

  it("defesa em profundidade: estado degradado em produção NUNCA usa memória (early-return)", async () => {
    const fallback = new MemorySessionStore();
    const store = new ResilientSessionStore(() => ({}) as unknown as Db, fallback, false);
    (store as unknown as { degraded: boolean }).degraded = true;
    await expect(store.get("s1")).rejects.toBeInstanceOf(PersistenceUnavailableError);
    expect(await fallback.get("s1")).toBeNull();
  });

  it("record a partir do store durável mantém o fencing token legível", async () => {
    let now = NOW;
    const store = new MemorySessionStore({ now: () => now });
    await store.tryReserve(reserveInput);
    await store.casController("s1", "agent", "human");
    const record: SessionRecord | null = await store.get("s1");
    expect(record?.humanActionToken).toBeNull();
    expect(await store.setHumanActionInflight("s1", now + HUMAN_ACTION_TTL_MS, "act-x")).toBe(true);
    expect((await store.get("s1"))?.humanActionToken).toBe("act-x");
    now += HUMAN_ACTION_TTL_MS + 1;
    expect(await store.renewHumanAction("s1", now + HUMAN_ACTION_TTL_MS, "act-x")).toBe(true);
  });
});
