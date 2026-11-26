/**
 * FENCING TOKEN — ações humanas concorrentes A/B (Parte 1.2 da 3ª auditoria).
 *
 * Provas sem rede (MemorySessionStore compartilhado = mesmo Neon):
 *  - a ação antiga (token stale) NÃO renova NEM libera o lock da ação nova;
 *  - quando a renovação falha/recusa, a ação ABORTA (AbortSignal) e
 *    `runHumanAction` rejeita com HumanActionLockLostError — falha de
 *    renovação nunca é engolida;
 *  - o agente NUNCA recebe o controle enquanto a ação mais recente está
 *    em voo (release recusado por ACTION_INFLIGHT).
 *
 * A "ação B" assume pelo CONTROL PLANE DURÁVEL (store) — o canal vivo CDP
 * fica em A; é exatamente o caso real entre instâncias Vercel.
 */
import { describe, expect, it } from "vitest";
import { MemorySessionStore, SessionRecord } from "../store";
import { ComputerSessionManager, HumanActionLockLostError } from "../sessionManager";
import type { ComputerProvider, ComputerSession } from "../provider";

const NOW = 1_700_000_000_000;
const TTL = 200;
const RENEW = 50;
const ACTION_B = "act-b-mais-recente";

function fakeSession(id: string, now: () => number): ComputerSession {
  let controller: "agent" | "human" = "agent";
  return {
    id,
    provider: "browserless",
    snapshot: () => ({
      sessionId: id,
      provider: "browserless",
      status: "ready" as const,
      controller,
      createdAt: now(),
      leaseExpiresAt: now() + 110_000,
      lastSeenAt: now(),
      unitsUsed: 0,
      error: null,
    }),
    connectionInfo: (screenEndpoint, inputEndpoint) => ({
      sessionId: id,
      provider: "browserless",
      status: "ready" as const,
      controller: "agent" as const,
      screenTransport: "sse-screencast-proxy" as const,
      screenEndpoint,
      inputEndpoint,
    }),
    compareAndSetController: (from, to) => {
      if (controller !== from) return false;
      controller = to;
      return true;
    },
    executeAction: async () => undefined,
    subscribeScreen: () => () => undefined,
    getLastFrame: () => null,
    reconnect: async () => undefined,
    close: async () => void 0,
  } as ComputerSession;
}

function buildManager(now: () => number, store: MemorySessionStore, instance: string): ComputerSessionManager {
  return new ComputerSessionManager({
    now,
    store,
    channelInstance: instance,
    humanActionTtlMs: TTL,
    humanActionRenewIntervalMs: RENEW,
    providerFactory: (): ComputerProvider => ({
      kind: "browserless",
      isConfigured: () => true,
      limits: () => ({ maxSessionMs: 110_000, maxConcurrentSessions: 1, monthlyBudgetUnits: 1000, notes: [] }),
      createSession: ({ sessionId }) =>
        Promise.resolve(fakeSession(sessionId ?? `fake-${instance}`, now)),
    }),
  });
}

async function reserveAndTakeover(mgr: ComputerSessionManager): Promise<string> {
  const reserved = await mgr.reserve({ conversationId: "conv-1", userId: "user-1" });
  if (!reserved.ok) throw new Error("reserva deveria passar");
  const sessionId = reserved.session.id;
  expect((await mgr.takeHumanControl("conv-1", "user-1")).ok).toBe(true);
  return sessionId;
}

describe("Fencing token — ação antiga NÃO afeta a ação mais recente", () => {
  it("A perde o lock (TTL), B assume com token novo; token stale de A não renova NEM libera", async () => {
    let now = NOW;
    const clock = () => now;
    const store = new MemorySessionStore({ now: clock });
    const a = buildManager(clock, store, "inst-A");

    await reserveAndTakeover(a);
    const beginA = await a.beginHumanAction("conv-1", "user-1");
    if (!beginA.ok) throw new Error("ação A deveria começar");

    now += TTL + 1;
    // B assume via CONTROL PLANE DURÁVEL — token novo, exclusivo.
    expect(await store.setHumanActionInflight(beginA.session.id, now + TTL, ACTION_B)).toBe(true);
    expect(beginA.actionId).not.toBe(ACTION_B);

    // Renovação/liberação STALE de A: recusadas, sem efeito no lock de B.
    expect(await store.renewHumanAction(beginA.session.id, now + TTL, beginA.actionId)).toBe(false);
    expect(await store.clearHumanAction(beginA.session.id, beginA.actionId)).toBe(false);

    const ended = await a.endHumanAction(beginA.session.id, beginA.actionId);
    expect(ended.controller).toBe("human");

    const record = await store.get(beginA.session.id);
    expect(record?.humanActionToken).toBe(ACTION_B);
    expect((record?.humanActionUntil ?? 0) > now).toBe(true);

    // O dono do token ainda renova normalmente.
    expect(await store.renewHumanAction(beginA.session.id, now + TTL, ACTION_B)).toBe(true);
  });

  it("enquanto a ação mais recente está em voo, grupo NÃO devolve o controle ao agente", async () => {
    let now = NOW;
    const clock = () => now;
    const store = new MemorySessionStore({ now: clock });
    const a = buildManager(clock, store, "inst-A");

    const sessionId = await reserveAndTakeover(a);

    now += TTL + 1;
    expect(await store.setHumanActionInflight(sessionId, now + TTL, ACTION_B)).toBe(true);

    expect((await a.releaseToAgent("conv-1", "user-1")).ok).toBe(false);
    expect((await a.takeHumanControl("conv-1", "user-2")).ok).toBe(false);

    await store.clearHumanAction(sessionId, ACTION_B);
    expect((await a.releaseToAgent("conv-1", "user-1")).ok).toBe(true);
    const record: SessionRecord | null = await store.get(sessionId);
    expect(record?.controller).toBe("agent");
    expect(record?.humanActionToken).toBeNull();
  });

  it("renovação RECUSADA → ação A aborta e runHumanAction rejeita com HumanActionLockLostError", async () => {
    let now = NOW;
    const clock = () => now;
    const store = new MemorySessionStore({ now: clock });
    const a = buildManager(clock, store, "inst-A");

    const sessionId = await reserveAndTakeover(a);
    const beginA = await a.beginHumanAction("conv-1", "user-1");
    if (!beginA.ok) throw new Error("ação A deveria começar");

    // Ação "CDP longa" pendurada numa promessa que nunca resolve.
    const runA = a.runHumanAction(
      beginA.session,
      () => new Promise(() => undefined),
      beginA.actionId
    );

    now += TTL + 1;
    // Ação mais recente assume o lock pelo store — renovação de A será
    // RECUSADA (token diferente) e a ação A deve ABORTAR, não engolir.
    expect(await store.setHumanActionInflight(sessionId, now + TTL, ACTION_B)).toBe(true);

    await expect(runA).rejects.toBeInstanceOf(HumanActionLockLostError);

    const record = await store.get(sessionId);
    expect(record?.controller).toBe("human");
    expect(record?.humanActionToken).toBe(ACTION_B);
    expect((record?.humanActionUntil ?? 0) > now).toBe(true);
  });

  it("ERRO na renovação (store indisponível) NÃO é engolido: ação aborta e o erro sobe", async () => {
    let clock = NOW;
    const now = () => clock;
    const store = new MemorySessionStore({ now });
    const manager = buildManager(now, store, "inst-A");

    const sessionId = await reserveAndTakeover(manager);
    const begin = await manager.beginHumanAction("conv-1", "user-1");
    if (!begin.ok) throw new Error("ação deveria começar");

    let renewFail = false;
    const failingRenew = Object.create(store) as MemorySessionStore;
    failingRenew.renewHumanAction = async (id: string, until: number, token: string) => {
      if (renewFail) throw new Error("neon indisponível");
      return store.renewHumanAction(id, until, token);
    };
    (manager as unknown as { store: unknown }).store = failingRenew;

    const run = manager.runHumanAction(begin.session, () => new Promise(() => undefined), begin.actionId);
    renewFail = true;
    clock += TTL + 1;
    await expect(run).rejects.toThrowError("neon indisponível");

    // O lock foi deixado para o TTL expirar (sem liberação pelo token errado).
    const record = await store.get(sessionId);
    expect(record?.controller).toBe("human");
  });
});
