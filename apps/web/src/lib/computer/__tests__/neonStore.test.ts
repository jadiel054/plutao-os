/**
 * Testes do NeonSessionStore contra um simulador fiel do driver Neon HTTP:
 * - `db.execute(sql)` recebe a query compilada do drizzle (text + params via
 *   PgDialect) — igual ao payload real do driver;
 * - UPDATE/INSERT SEM `RETURNING` devolve `{ rows: [], rowCount: n }` —
 *   linhas SÓ existem quando há RETURNING (o bug da auditoria: checar
 *   "result.rows.length" sem RETURNING sempre dava falso negativo);
 * - `now()`, `now() + interval` e EXTRACT(EPOCH) usam o relógio REAL.
 */
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Db } from "@plutao/db";
import {
  MemorySessionStore,
  NeonSessionStore,
  PersistenceUnavailableError,
  ResilientSessionStore,
} from "../store";
import { ComputerSessionManager } from "../sessionManager";
import type { ComputerProvider, ComputerConnectionInfo, ComputerSession } from "../provider";

type FakeRow = Record<string, unknown>;

type MockState = {
  rows: Map<string, FakeRow>;
  tableExists: boolean;
  now: () => number;
};

const LIVE = ["creating", "ready", "reconnecting"];

function dateParam(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Simulador do driver Neon HTTP: compila o objeto SQL do drizzle e executa
 * contra linhas snake_case em memória. Respostas espelham o contrato real:
 * `{ rows, rowCount }` para consultas e `{ rows: [], rowCount }` para
 * UPDATEs sem RETURNING.
 */
function makeNeonHttpMock(state: MockState): Db {
  const dialect = new PgDialect();
  const rows = state.rows;

  const isLiveRow = (row: FakeRow): boolean =>
    row.closed_at === null && LIVE.includes(String(row.status));

  const unitsWallClock = (row: FakeRow): number => {
    const created = dateParam(row.created_at).getTime();
    return Math.ceil(Math.max(0, state.now() - created) / 30_000);
  };

  const simulate = (text: string, params: unknown[]): unknown => {
    if (text === "SELECT to_regclass('public.computer_sessions') AS reg") {
      return { rows: [{ reg: state.tableExists ? "computer_sessions" : null }], rowCount: 1 };
    }

    if (text.startsWith("INSERT INTO computer_sessions")) {
      if (!state.tableExists) {
        const error = new Error('relation "computer_sessions" does not exist') as Error & { code?: string };
        error.code = "42P01";
        throw error;
      }
      for (const row of rows.values()) {
        if (isLiveRow(row)) {
          const error = new Error('duplicate key value violates unique constraint "computer_sessions_single_live_uidx"') as Error & {
            code?: string;
          };
          error.code = "23505";
          throw error;
        }
      }
      // Literais ('creating', 'agent', 0) são INLINE no texto compilado —
      // params só carregam os valores que vieram do JS.
      const [id, conversationId, userId, provider, lease, seen, month, created] = params as [
        string, string, string, string, Date, Date, string, Date,
      ];
      rows.set(id, {
        id,
        conversation_id: conversationId,
        user_id: userId,
        status: "creating",
        provider,
        controller: "agent",
        controller_changed_at: null,
        lease_expires_at: lease,
        last_seen_at: seen,
        units_used: 0,
        billing_month: month,
        channel_instance: null,
        channel_expires_at: null,
        human_action_until: null,
        error: null,
        created_at: created,
        closed_at: null,
      });
      return { rows: [], rowCount: 1, command: "INSERT" };
    }

    if (text === "SELECT * FROM computer_sessions WHERE id = $1 LIMIT 1") {
      const row = rows.get(String(params[0]));
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (text.startsWith("SELECT * FROM computer_sessions WHERE conversation_id =")) {
      const conversationId = String(params[0]);
      const live = [...rows.values()]
        .filter((row) => row.conversation_id === conversationId && isLiveRow(row))
        .sort((a, b) => dateParam(b.created_at).getTime() - dateParam(a.created_at).getTime());
      return { rows: live, rowCount: live.length };
    }

    if (text.startsWith("SELECT COALESCE(SUM(units_used), 0) AS used")) {
      const month = String(params[0]);
      let used = 0;
      for (const row of rows.values()) {
        if (row.billing_month === month) used += Number(row.units_used ?? 0);
      }
      return { rows: [{ used }], rowCount: 1 };
    }

    if (text.startsWith("UPDATE computer_sessions SET controller = ")) {
      const hasReturning = /RETURNING id$/.test(text);
      const guarded = text.includes("AND (human_action_until IS NULL OR human_action_until < now())");
      const [to, id, from] = [params[0], params[1], params[2]] as [string, string, string];
      const row = rows.get(id);
      const matched =
        hasReturning &&
        row !== undefined &&
        isLiveRow(row) &&
        row.controller === from &&
        (!guarded || row.human_action_until === null || dateParam(row.human_action_until).getTime() < state.now());
      if (matched) {
        row.controller = to;
        row.controller_changed_at = new Date(state.now());
        row.human_action_until = null;
      }
      return { rows: matched ? [{ id }] : [], rowCount: matched ? 1 : 0, command: "UPDATE" };
    }

    if (text.startsWith("UPDATE computer_sessions SET human_action_until = NULL")) {
      const id = String(params[0]);
      const row = rows.get(id);
      if (row) row.human_action_until = null;
      return { rows: [], rowCount: 1, command: "UPDATE" };
    }

    if (text.startsWith("UPDATE computer_sessions SET human_action_until = ")) {
      const inflightCAS = text.includes("AND (human_action_until IS NULL OR human_action_until < now())");
      const until = dateParam(params[0]);
      const id = String(params[1]);
      const row = rows.get(id);
      const matched =
        row !== undefined &&
        isLiveRow(row) &&
        row.controller === "human" &&
        (!inflightCAS || row.human_action_until === null || dateParam(row.human_action_until).getTime() < state.now());
      if (matched) row.human_action_until = until;
      return { rows: matched ? [{ id }] : [], rowCount: matched ? 1 : 0, command: "UPDATE" };
    }

    if (text.startsWith("UPDATE computer_sessions SET channel_instance = ")) {
      const [instanceId, leaseMs, id, sameInstance] = [
        params[0], Number(params[1]), String(params[2]), params[3],
      ];
      const row = rows.get(id);
      const busy =
        row !== undefined &&
        row.channel_instance !== null &&
        row.channel_instance !== sameInstance &&
        dateParam(row.channel_expires_at).getTime() > state.now();
      const canAttach =
        row !== undefined &&
        isLiveRow(row) &&
        !busy &&
        (row.channel_instance === null ||
          row.channel_instance === sameInstance ||
          dateParam(row.channel_expires_at).getTime() < state.now());
      if (canAttach) {
        row.channel_instance = instanceId;
        row.channel_expires_at = new Date(state.now() + leaseMs);
      }
      return { rows: canAttach ? [{ id }] : [], rowCount: canAttach ? 1 : 0, command: "UPDATE" };
    }

    if (text.startsWith("UPDATE computer_sessions SET channel_expires_at =")) {
      const [leaseMs, id, instanceId] = [Number(params[0]), String(params[1]), params[2]];
      const row = rows.get(id);
      const matched = row !== undefined && isLiveRow(row) && row.channel_instance === instanceId;
      if (matched) {
        row.channel_expires_at = new Date(state.now() + leaseMs);
        row.last_seen_at = new Date(state.now());
      }
      return { rows: matched ? [{ id }] : [], rowCount: matched ? 1 : 0, command: "UPDATE" };
    }

    if (text.startsWith("UPDATE computer_sessions SET channel_instance = NULL")) {
      const instanceId = params[0];
      const id = String(params[1]);
      const row = rows.get(id);
      if (row && row.channel_instance === instanceId) {
        row.channel_instance = null;
        row.channel_expires_at = null;
      }
      return { rows: [], rowCount: 1, command: "UPDATE" };
    }

    if (text.startsWith("UPDATE computer_sessions SET last_seen_at = GREATEST")) {
      const [lastSeen, leaseExp, units, status, error, id] = params as [
        Date | null, Date | null, number | null, string | null, string | null, string,
      ];
      const row = rows.get(id);
      if (!row || !isLiveRow(row)) return { rows: [], rowCount: 0, command: "UPDATE" };
      if (lastSeen) row.last_seen_at = new Date(Math.max(dateParam(row.last_seen_at).getTime(), lastSeen.getTime()));
      if (leaseExp) row.lease_expires_at = new Date(Math.max(dateParam(row.lease_expires_at).getTime(), leaseExp.getTime()));
      if (units !== null) row.units_used = Math.max(Number(row.units_used), Math.max(0, units));
      if (status) row.status = status;
      if (error !== null) row.error = error;
      return { rows: [{ ...row }], rowCount: 1, command: "UPDATE" };
    }

    if (text.startsWith("UPDATE computer_sessions SET status = 'expired'")) {
      const tolerance = Number(params[0]);
      const expired = [...rows.entries()].filter(
        ([, row]) =>
          isLiveRow(row) &&
          dateParam(row.lease_expires_at).getTime() + tolerance < state.now()
      );
      for (const [, row] of expired) {
        row.status = "expired";
        row.closed_at = new Date(state.now());
        row.human_action_until = null;
        row.channel_instance = null;
        row.channel_expires_at = null;
        row.units_used = Math.max(Number(row.units_used), unitsWallClock(row));
      }
      return { rows: expired.map(([id]) => ({ id })), rowCount: expired.length, command: "UPDATE" };
    }

    if (text.startsWith("UPDATE computer_sessions SET status =")) {
      const [status, unitSecs, error, id] = params as [string, number, string | null, string];
      const row = rows.get(id);
      if (!row || row.closed_at !== null) return { rows: [], rowCount: 0, command: "UPDATE" };
      row.status = status;
      row.closed_at = new Date(state.now());
      row.human_action_until = null;
      row.channel_instance = null;
      row.channel_expires_at = null;
      const expectedUnits = Math.ceil(
        Math.max(0, state.now() - dateParam(row.created_at).getTime()) / (unitSecs * 1000)
      );
      row.units_used = Math.max(Number(row.units_used), expectedUnits);
      if (error !== null) row.error = error;
      return { rows: [{ id }], rowCount: 1, command: "UPDATE" };
    }

    throw new Error(`[neon-mock] statement não simulado: ${text}`);
  };

  return {
    async execute(query: unknown) {
      const compiled = dialect.sqlToQuery(query as never);
      return simulate(collapse(compiled.sql), compiled.params as unknown[]);
    },
  } as unknown as Db;
}

function seedRow(state: MockState, overrides: Partial<FakeRow> = {}): FakeRow {
  const row: FakeRow = {
    id: "s-seed",
    conversation_id: "conv-1",
    user_id: "user-1",
    status: "ready",
    provider: "browserless",
    controller: "human",
    controller_changed_at: null,
    lease_expires_at: new Date(state.now() + 110_000),
    last_seen_at: new Date(state.now()),
    units_used: 0,
    billing_month: new Date(state.now()).toISOString().slice(0, 7),
    channel_instance: null,
    channel_expires_at: null,
    human_action_until: null,
    error: null,
    created_at: new Date(state.now()),
    closed_at: null,
    ...overrides,
  };
  state.rows.set(String(row.id), row);
  return row;
}

function makeState(overrides: Partial<MockState> = {}): MockState {
  return { rows: new Map(), tableExists: true, now: Date.now, ...overrides };
}

type Counters = { created: number };

function fakeProviderFactory(counter: Counters): () => ComputerProvider {
  return (): ComputerProvider => ({
    kind: "browserless",
    isConfigured: () => true,
    limits: () => ({ maxSessionMs: 110_000, maxConcurrentSessions: 1, monthlyBudgetUnits: 1000, notes: [] }),
    createSession: async ({ sessionId }): Promise<ComputerSession> => {
      counter.created += 1;
      const snap = {
        sessionId: sessionId ?? `fake-${counter.created}`,
        provider: "browserless" as const,
        status: "ready" as const,
        controller: "agent" as "agent" | "human",
        createdAt: Date.now(),
        leaseExpiresAt: Date.now() + 110_000,
        lastSeenAt: Date.now(),
        unitsUsed: 0,
        error: null,
      };
      const session: ComputerSession = {
        id: snap.sessionId,
        provider: snap.provider,
        snapshot: () => ({ ...snap }),
        connectionInfo: (screenEndpoint: string, inputEndpoint: string): ComputerConnectionInfo => ({
          ...snap,
          screenTransport: "sse-screencast-proxy" as const,
          screenEndpoint,
          inputEndpoint,
        }),
        compareAndSetController: (from: "agent" | "human", to: "agent" | "human") => {
          if (snap.controller !== from) return false;
          snap.controller = to;
          return true;
        },
        executeAction: async () => undefined,
        subscribeScreen: () => () => undefined,
        getLastFrame: () => null,
        reconnect: async () => undefined,
        close: async () => undefined,
      };
      return session;
    },
  });
}

describe("NeonSessionStore — formato REAL de resposta do driver Neon HTTP", () => {
  it("casController: sem casar → rows vazio (false); casando → RETURNING entrega a linha (true)", async () => {
    const state = makeState();
    const store = new NeonSessionStore(() => makeNeonHttpMock(state));
    seedRow(state, { controller: "agent" });

    expect(await store.casController("s-seed", "human", "agent")).toBe(false);
    expect(await store.casController("s-seed", "agent", "human")).toBe(true);
    expect((await store.get("s-seed"))?.controller).toBe("human");
  });

  it("setHumanActionInflight/renewHumanAction: linhas só via RETURNING; CAS humano→agente falha com lock vivo", async () => {
    const state = makeState();
    const store = new NeonSessionStore(() => makeNeonHttpMock(state));
    seedRow(state, { controller: "human" });

    expect(await store.setHumanActionInflight("s-seed", state.now() + 5_000)).toBe(true);
    expect(await store.renewHumanAction("s-seed", state.now() + 9_000)).toBe(true);
    expect(await store.casController("s-seed", "human", "agent")).toBe(false);

    const record = await store.get("s-seed");
    expect((record?.humanActionUntil ?? 0) > state.now()).toBe(true);

    await store.clearHumanAction("s-seed");
    expect(await store.casController("s-seed", "human", "agent")).toBe(true);
  });

  it("renewChannel: renovação casando dono+linha viva; instância errada NÃO renova", async () => {
    const state = makeState();
    const store = new NeonSessionStore(() => makeNeonHttpMock(state));
    seedRow(state, { channel_instance: "inst-A", channel_expires_at: new Date(state.now() + 1_000) });

    expect(await store.renewChannel("s-seed", "inst-B", 30_000)).toBe(false);
    expect(await store.renewChannel("s-seed", "inst-A", 30_000)).toBe(true);
  });

  it("attachChannel: ganha o canal quando livre; BUSY com lease de outra instância vivo; assume após expirar", async () => {
    const state = makeState();
    const store = new NeonSessionStore(() => makeNeonHttpMock(state));
    seedRow(state, {});

    expect(await store.attachChannel("s-seed", "inst-A", 60)).toBe("ok");
    expect(await store.attachChannel("s-seed", "inst-B", 60)).toBe("BUSY");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await store.attachChannel("s-seed", "inst-B", 60)).toBe("ok");
  });

  it("sweep de sessão abandonada contabiliza consumo real (unidades de tempo de parede) no ledger mensal", async () => {
    const state = makeState();
    const store = new NeonSessionStore(() => makeNeonHttpMock(state));
    const month = new Date(state.now()).toISOString().slice(0, 7);
    seedRow(state, {
      id: "s-abandoned",
      created_at: new Date(state.now() - 90_000),
      lease_expires_at: new Date(state.now() - 50_000),
      billing_month: month,
    });

    expect(await store.sweepExpired()).toBe(1);
    expect(await store.monthlyUnitsUsed(month)).toBe(3);

    seedRow(state, {
      id: "s-closed",
      created_at: new Date(state.now() - 65_000),
      lease_expires_at: new Date(state.now() + 50_000),
      billing_month: month,
    });
    await store.close("s-closed", "closed");
    expect(await store.monthlyUnitsUsed(month)).toBe(6);
  });

  it("cota após encerramento inesperado: reserva seguinte cai em QUOTA_EXHAUSTED com o saldo do sweep", async () => {
    const state = makeState();
    const store = new NeonSessionStore(() => makeNeonHttpMock(state));
    const month = new Date(state.now()).toISOString().slice(0, 7);
    seedRow(state, {
      id: "s-crash",
      created_at: new Date(state.now() - 31_000),
      lease_expires_at: new Date(state.now() - 31_000),
      billing_month: month,
    });
    await store.sweepExpired();
    const outcome = await store.tryReserve({
      sessionId: "s-next",
      conversationId: "conv-2",
      userId: "user-2",
      provider: "browserless",
      leaseExpiresAt: state.now() + 110_000,
      monthlyBudgetUnits: 1,
    });
    expect(outcome).toEqual({ ok: false, reason: "QUOTA_EXHAUSTED" });
  });
});

describe("Cross-instance com formato Neon HTTP real — reserva e takeover entre instâncias", () => {
  it("reserva única e CAS de controle passam pelo MESMO plano SQL (não por memória de instância)", async () => {
    const state = makeState();
    const store = new NeonSessionStore(() => makeNeonHttpMock(state));
    const a = new ComputerSessionManager({ providerFactory: fakeProviderFactory({ created: 0 }), store, channelInstance: "inst-A" });
    const b = new ComputerSessionManager({ providerFactory: fakeProviderFactory({ created: 0 }), store, channelInstance: "inst-B" });

    expect(await a.reserve({ conversationId: "conv-1", userId: "user-1" })).toMatchObject({ ok: true });
    expect(await b.reserve({ conversationId: "conv-2", userId: "user-2" })).toEqual({ ok: false, reason: "SESSION_LIMIT" });

    expect((await b.takeHumanControl("conv-1", "user-1")).ok).toBe(true);
    expect(await a.isHumanInControlDurable("conv-1", "user-1")).toBe(true);
    expect((await a.releaseToAgent("conv-1", "user-1")).ok).toBe(true);
    expect((await a.releaseToAgent("conv-1", "user-1")).ok).toBe(false);
  });
});

describe("Falha do Neon — bloqueio seguro (fail-closed, produção)", () => {
  it("tabela ausente sem permissão de degradação → PersistenceUnavailableError", async () => {
    const state = makeState({ tableExists: false });
    const store = new ResilientSessionStore(() => makeNeonHttpMock(state), new MemorySessionStore(), false);
    await expect(
      store.tryReserve({
        sessionId: "s1",
        conversationId: "c1",
        userId: "u1",
        provider: "browserless",
        leaseExpiresAt: Date.now() + 110_000,
        monthlyBudgetUnits: 1000,
      })
    ).rejects.toBeInstanceOf(PersistenceUnavailableError);
    expect(store.describe()).toEqual({ mode: "neon", degraded: false });
  });

  it("Neon inacessível (erro de rede) sem permissão de degradação → PersistenceUnavailableError", async () => {
    const store = new ResilientSessionStore(
      () => {
        throw new TypeError("fetch failed");
      },
      new MemorySessionStore(),
      false
    );
    await expect(store.get("s1")).rejects.toBeInstanceOf(PersistenceUnavailableError);
  });

  it("manager.reserve retorna PERSISTENCE_UNAVAILABLE e NÃO abre navegador real", async () => {
    const state = makeState({ tableExists: false });
    const store = new ResilientSessionStore(() => makeNeonHttpMock(state), new MemorySessionStore(), false);
    const counter: Counters = { created: 0 };
    const manager = new ComputerSessionManager({ providerFactory: fakeProviderFactory(counter), store, channelInstance: "inst-A" });
    expect(await manager.reserve({ conversationId: "conv-1", userId: "user-1" })).toEqual({
      ok: false,
      reason: "PERSISTENCE_UNAVAILABLE",
    });
    expect(counter.created).toBe(0);
  });
});

describe("Lock renovável de ação humana — agente NUNCA recebe o controle com ação em voo", () => {
  function twoManagersWithRenewal(state: MockState) {
    const store = new NeonSessionStore(() => makeNeonHttpMock(state));
    const a = new ComputerSessionManager({
      providerFactory: fakeProviderFactory({ created: 0 }),
      store,
      channelInstance: "inst-A",
      humanActionTtlMs: 200,
      humanActionRenewIntervalMs: 50,
    });
    const b = new ComputerSessionManager({
      providerFactory: fakeProviderFactory({ created: 0 }),
      store,
      channelInstance: "inst-B",
      humanActionTtlMs: 200,
      humanActionRenewIntervalMs: 50,
    });
    return { a, b };
  }

  it("devolução recusada durante TODA ação longa (lock expira em 200ms e é RENOVADO) e liberada no final", async () => {
    const state = makeState();
    const { a, b } = twoManagersWithRenewal(state);
    expect(await a.reserve({ conversationId: "conv-1", userId: "user-1" })).toMatchObject({ ok: true });
    const session = await a.ensureSession("conv-1", "user-1");
    if (!session) throw new Error("sessão deveria existir");
    expect((await a.takeHumanControl("conv-1", "user-1")).ok).toBe(true);

    const releases: Array<{ ok: boolean; reason?: string }> = [];
    const longNavigation = a.runHumanAction(session, async () => {
      // Navegação "de 30s" comprimida: 500ms com lock que vence em 200ms —
      // sem renovação, a devolução PASSARIA em t=200ms.
      await new Promise((resolve) => setTimeout(resolve, 500));
      releases.push(await a.releaseToAgent("conv-1", "user-1"));
      releases.push(await b.releaseToAgent("conv-1", "user-1"));
      return "navigated";
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await b.releaseToAgent("conv-1", "user-1")).ok).toBe(false);
    expect((await b.takeHumanControl("conv-1", "user-2")).ok).toBe(false);

    await longNavigation;
    expect(releases.length).toBe(2);
    for (const release of releases) {
      expect(release).toMatchObject({ ok: false, reason: "ACTION_INFLIGHT" });
    }
    const result = await b.releaseToAgent("conv-1", "user-1");
    expect(result).toMatchObject({ ok: true, controller: "agent" });
  });
});
