/**
 * Fases 1+4 — GERENCIADOR DE SESSÕES DO COMPUTADOR DO PLUTÃO.
 *
 * ARQUITETURA (correção da auditoria): separação entre
 *   - CONTROL PLANE DURÁVEL: metadados em `computer_sessions` no Neon via
 *     SessionStore — reserva única, autorização, controller (CAS em SQL),
 *     cota mensal, lease e dono do canal. Sobrevive a instâncias Vercel
 *     distintas e é a fonte de verdade entre elas.
 *   - CANAL VIVO (data plane): a conexão CDP/screencast/input é LOCAL à
 *     instância que abriu o navegador (`channel_instance` + lease
 *     heartbeat `channel_expires_at`). Outra instância só assume o canal
 *     quando o lease expira — e, no Browserless Free, isso abre um
 *     navegador NOVO (estado do navegador não preservado; o estado que
 *     sobrevive é o do sandbox da conversa).
 *
 * Responsabilidades neste módulo (nunca no provedor, nunca no frontend):
 *  - Escolha do provedor por ambiente (PLUTAO_COMPUTER_PROVIDER), sem
 *    tocar no Chat ao trocar de provedor.
 *  - UMA sessão simultânea por instalação — gate atômico no store
 *    (índice único parcial via SQL; ver DB_PROPOSTA_COMPUTER_SESSIONS).
 *  - Autorização por usuário + conversa em toda operação.
 *  - Controle agente x humano EXCLUSIVO por CAS durável (UPDATE ... WHERE
 *    controller = ...). NÃO usa last-write-wins de eventos como garantia:
 *    eventos são só o acompanhamento observável no Chat.
 *  - Guarda de ação humana em andamento: devolução é recusada enquanto
 *    houver input executando (human_action_until, TTL auto-libera).
 *  - Cota durável: unidades por sessão no store; bloqueia novas sessões
 *    quando o orçamento gratuito termina; nenhuma cobrança automática.
 *  - Segredos apenas no servidor; info de conexão autorizada não contém
 *    tokens nem endpoints do provedor.
 */
import { randomUUID } from "node:crypto";
import { COMPUTE_PROVIDER_ENV } from "./env";
import {
  ComputerProviderError,
  type ComputerConnectionInfo,
  type ComputerController,
  type ComputerProvider,
  type ComputerProviderKind,
  type ComputerSession,
  type ComputerSessionSnapshot,
  type ComputerSessionStatus,
} from "./provider";
import {
  CHANNEL_LEASE_MS,
  HUMAN_ACTION_TTL_MS,
  UNIT_MS,
  PersistenceUnavailableError,
  ResilientSessionStore,
  type SessionRecord,
  type SessionStore,
  type StoreDescribe,
  isLiveRecord,
  monthKeyOf,
} from "./store";
import { createBrowserlessProvider, readBrowserlessConfig } from "./providers/browserless";
import { createSelfHostedProvider, readSelfHostedConfig } from "./providers/self-hosted";
import { getDb } from "@/lib/db";

export type ReserveReason =
  | "ok"
  | "PROVIDER_UNCONFIGURED"
  | "SESSION_LIMIT"
  | "QUOTA_EXHAUSTED"
  | "PROVIDER_UNAVAILABLE"
  | "PERSISTENCE_UNAVAILABLE";

export type SessionManagerOptions = {
  now?: () => number;
  /** Injeta provedor (testes/troca programática); default: por ambiente. */
  providerFactory?: () => ComputerProvider;
  /** Injeta o store durável (testes usam memória; default: Neon resiliente). */
  store?: SessionStore;
  /** Identificador da instância dona do canal vivo (default: UUID do processo). */
  channelInstance?: string;
  channelLeaseMs?: number;
  /** Intervalo de renovação do lock de ação humana (default: TTL/3). */
  humanActionRenewIntervalMs?: number;
  /** Lease do lock de ação humana (default: HUMAN_ACTION_TTL_MS). */
  humanActionTtlMs?: number;
};

export type SessionView = {
  sessionId: string | null;
  conversationId: string | null;
  provider: ComputerProviderKind | null;
  status: ComputerSessionSnapshot["status"] | "offline";
  controller: ComputerController;
  createdAt: number | null;
  leaseExpiresAt: number | null;
  lastSeenAt: number | null;
  unitsUsed: number;
  /** -1 = sem cota monetária (self-hosted). */
  unitsBudget: number;
  error: string | null;
  /** True quando existe sessão ativa em OUTRA conversa/instância. */
  activeElsewhere: boolean;
  /** Onde está o canal vivo do Chromium. */
  channelOwner: "here" | "elsewhere" | "free" | null;
  /** Plano de persistência do control plane (Neon vs fallback memória). */
  persist: StoreDescribe;
  limits: ComputerProvider["limits"] extends () => infer L ? L : never;
};

export type ControllerChangeResult = {
  ok: boolean;
  controller: ComputerController;
  reason?: "SESSION_NOT_FOUND" | "CONTROL_CONFLICT" | "ACTION_INFLIGHT";
};

type ManagedEntry = {
  session: ComputerSession;
  conversationId: string;
  userId: string;
};

export class ComputerSessionManager {
  /** Sessões cujo canal vivo é DESTA instância (o CDP não atravessa instância). */
  private localSessions = new Map<string, ManagedEntry>();
  /** Janela de criação da sessão (após gate do store, antes de conectar). */
  private creating = 0;
  private now: () => number;
  private providerFactory: () => ComputerProvider;
  private store: SessionStore;
  private channelInstance: string;
  private channelLeaseMs: number;
  private humanActionRenewIntervalMs: number;
  private humanActionTtlMs: number;

  constructor(options: SessionManagerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.channelInstance = options.channelInstance ?? randomUUID();
    this.channelLeaseMs = options.channelLeaseMs ?? CHANNEL_LEASE_MS;
    this.providerFactory = options.providerFactory ?? (() => this.createEnvProvider());
    this.humanActionRenewIntervalMs =
      options.humanActionRenewIntervalMs ?? Math.max(250, Math.floor(HUMAN_ACTION_TTL_MS / 3));
    this.humanActionTtlMs = options.humanActionTtlMs ?? HUMAN_ACTION_TTL_MS;
    // getDb lança apenas na PRIMEIRA operação (lazy) — falha de
    // DATABASE_URL/tabela degrada para memória (testes/desenv) ou recusa a
    // sessão real em produção (PersistenceUnavailableError).
    this.store = options.store ?? new ResilientSessionStore(() => getDb());
  }

  private createEnvProvider(): ComputerProvider {
    switch ((process.env[COMPUTE_PROVIDER_ENV.name] ?? "").trim() || COMPUTE_PROVIDER_ENV.fallback) {
      case "self-hosted":
        return createSelfHostedProvider(
          readSelfHostedConfig() ?? {
            token: "",
            endpoint: "",
            maxSessionMs: 30 * 60 * 1000,
            monthlyBudgetUnits: Number.POSITIVE_INFINITY,
          }
        );
      case "browserless":
      default:
        return createBrowserlessProvider(
          readBrowserlessConfig() ?? {
            token: "",
            endpoint: "",
            maxSessionMs: 2 * 60 * 1000,
            monthlyBudgetUnits: 1000,
          }
        );
    }
  }

  getProvider(): ComputerProvider {
    return this.providerFactory();
  }

  limits() {
    return this.getProvider().limits();
  }

  unitsBudget(): number {
    return this.limits().monthlyBudgetUnits;
  }

  /** Consumo mensal DURÁVEL (store) — não depende de memória de instância. */
  async unitsUsed(): Promise<number> {
    return this.store.monthlyUnitsUsed(monthKeyOf(this.now()));
  }

  persistMode(): StoreDescribe {
    return this.store.describe();
  }

  private unitsFromSnapshot(snap: ComputerSessionSnapshot): number {
    const end = snap.leaseExpiresAt > 0 ? Math.min(this.now(), snap.leaseExpiresAt) : this.now();
    return Math.max(snap.unitsUsed, Math.ceil(Math.max(0, end - snap.createdAt) / UNIT_MS));
  }

  /**
   * RESERVA ATÔMICA ENTRE INSTÂNCIAS: o gate é o INSERT no store (índice
   * único parcial recusa a 2ª linha viva) ANTES de abrir o navegador.
   */
  async reserve(opts: {
    conversationId: string;
    userId: string;
  }): Promise<{ ok: true; session: ComputerSession } | { ok: false; reason: ReserveReason }> {
    const provider = this.getProvider();
    if (!provider.isConfigured()) return { ok: false, reason: "PROVIDER_UNCONFIGURED" };
    const limits = provider.limits();

    const sessionId = `cmp-${randomUUID()}`;
    let gate: Awaited<ReturnType<SessionStore["tryReserve"]>>;
    try {
      gate = await this.store.tryReserve({
        sessionId,
        conversationId: opts.conversationId,
        userId: opts.userId,
        provider: provider.kind,
        leaseExpiresAt: this.now() + limits.maxSessionMs,
        monthlyBudgetUnits: limits.monthlyBudgetUnits,
      });
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) {
        return { ok: false, reason: "PERSISTENCE_UNAVAILABLE" };
      }
      throw error;
    }
    if (!gate.ok) return { ok: false, reason: gate.reason };

    let attach: "ok" | "BUSY" | "NOT_FOUND";
    try {
      attach = await this.store.attachChannel(sessionId, this.channelInstance, this.channelLeaseMs);
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) {
        return { ok: false, reason: "PERSISTENCE_UNAVAILABLE" };
      }
      throw error;
    }
    if (attach !== "ok") {
      await this.store.close(sessionId, "error", "canal vivo ocupado na reserva").catch(() => undefined);
      return { ok: false, reason: "SESSION_LIMIT" };
    }

    this.creating += 1;
    let session: ComputerSession;
    try {
      session = await provider.createSession({
        conversationId: opts.conversationId,
        userId: opts.userId,
        sessionId,
      });
    } catch (error) {
      this.creating -= 1;
      await this.store.close(sessionId, "error", errorMessage(error)).catch(() => undefined);
      return { ok: false, reason: toReserveReason(error) };
    }
    this.creating -= 1;
    this.localSessions.set(session.id, { session, conversationId: opts.conversationId, userId: opts.userId });
    await this.syncSnapshot(session).catch(() => undefined);
    return { ok: true, session };
  }

  /** Sessão com canal vivo NESTA instância, só para o dono (usuário+conversa). */
  activeFor(conversationId: string | null | undefined, userId: string | null | undefined): ComputerSession | null {
    if (!conversationId) return null;
    for (const entry of this.localSessions.values()) {
      if (entry.conversationId !== conversationId || entry.userId !== userId) continue;
      if (this.localExpired(entry)) {
        void this.closeLocal(entry.session, "expired").catch(() => undefined);
        return null;
      }
      return entry.session;
    }
    return null;
  }

  private localExpired(entry: ManagedEntry): boolean {
    const snap = entry.session.snapshot();
    return snap.leaseExpiresAt > 0 && this.now() > snap.leaseExpiresAt + 5_000;
  }

  /**
   * Rota de acesso ao canal vivo a partir de QUALQUER instância: usa o
   * registro durável; se o canal está livre/expirado, assume abrindo o
   * navegador de novo (Free: estado do navegador perdido — documentado e
   * sinalizado na UI com "navegador novo na reconexão").
   */
  async ensureSession(conversationId: string, userId: string): Promise<ComputerSession | null> {
    const local = this.activeFor(conversationId, userId);
    if (local) {
      await this.heartbeat(local).catch(() => undefined);
      return local;
    }
    const record = await this.store.findLiveByConversation(conversationId);
    if (!record || record.userId !== userId) return null;
    const attach = await this.store.attachChannel(record.id, this.channelInstance, this.channelLeaseMs);
    if (attach !== "ok") return null;
    const provider = this.getProvider();
    if (!provider.isConfigured()) return null;
    let session: ComputerSession;
    try {
      // Mesmo id durável; navegador novo quando o estado remoto não existe.
      session = await provider.createSession({
        conversationId,
        userId,
        sessionId: record.id,
      });
    } catch (error) {
      await this.store.close(record.id, "error", errorMessage(error)).catch(() => undefined);
      return null;
    }
    if (record.controller === "human") {
      session.compareAndSetController("agent", "human");
    }
    this.localSessions.set(session.id, { session, conversationId, userId });
    await this.syncSnapshot(session).catch(() => undefined);
    return session;
  }

  /** Heartbeat do canal + contabilidade durável (chamado por SSE/input). */
  async heartbeat(session: ComputerSession): Promise<void> {
    const snap = session.snapshot();
    const record = await this.store.get(snap.sessionId);
    if (!isLiveRecord(record) || snap.status === "closed" || snap.status === "expired") {
      await this.closeLocal(session, snap.status === "closed" ? "closed" : "expired");
      return;
    }
    const renewed = await this.store.renewChannel(snap.sessionId, this.channelInstance, this.channelLeaseMs);
    if (!renewed) return;
    await this.store.renew(snap.sessionId, {
      status: snap.status,
      lastSeenAt: Math.max(snap.lastSeenAt, this.now()),
      leaseExpiresAt: snap.leaseExpiresAt,
      unitsUsed: this.unitsFromSnapshot(snap),
    });
  }

  private async syncSnapshot(session: ComputerSession): Promise<void> {
    const snap = session.snapshot();
    await this.store.renew(snap.sessionId, {
      status: snap.status,
      lastSeenAt: snap.lastSeenAt,
      leaseExpiresAt: snap.leaseExpiresAt,
      unitsUsed: this.unitsFromSnapshot(snap),
    });
  }

  private async closeLocal(session: ComputerSession, status: ComputerSessionStatus): Promise<void> {
    const snap = session.snapshot();
    await this.store
      .renew(snap.sessionId, { unitsUsed: this.unitsFromSnapshot(snap), lastSeenAt: snap.lastSeenAt })
      .catch(() => undefined);
    this.localSessions.delete(snap.sessionId);
    await session.close().catch(() => undefined);
    await this.store.releaseChannel(snap.sessionId, this.channelInstance).catch(() => undefined);
    await this.store.close(snap.sessionId, status).catch(() => undefined);
  }

  /** Apenas testes: descarta estado local sem rede (store injetado é do teste). */
  resetForTests(): void {
    this.localSessions.clear();
    this.creating = 0;
  }

  /** Indicador de criação em andamento (gate já preso no store). */
  isReserving(): boolean {
    return this.creating > 0;
  }

  /** Só a SESSÃO REMOTA local: humano no controle para esta conversa+usuário. */
  isHumanInControlFor(conversationId: string, userId: string): boolean {
    const session = this.activeFor(conversationId, userId);
    return session ? session.snapshot().controller === "human" : false;
  }

  /** Fonte durável da pausa do agente — vale entre instâncias. */
  async isHumanInControlDurable(conversationId: string, userId: string): Promise<boolean> {
    const record = await this.recordFor(conversationId, userId);
    return record?.controller === "human";
  }

  private async recordFor(conversationId: string, userId: string): Promise<SessionRecord | null> {
    const local = this.activeFor(conversationId, userId);
    const record = local
      ? await this.store.get(local.id)
      : await this.store.findLiveByConversation(conversationId);
    if (!record || !isLiveRecord(record) || record.userId !== userId) return null;
    return record;
  }

  async closeConversation(conversationId: string, userId: string): Promise<boolean> {
    const local = this.activeFor(conversationId, userId);
    if (local) {
      await this.closeLocal(local, "closed");
      return true;
    }
    const record = await this.store.findLiveByConversation(conversationId);
    if (record && record.userId === userId) {
      // Canal vivo em outra instância: encerra o control plane; o navegador
      // remoto morre pelo TTL do provedor (Free: 2 min).
      await this.store.close(record.id, "closed");
      return true;
    }
    return false;
  }

  async closeAll(): Promise<void> {
    for (const entry of [...this.localSessions.values()]) {
      await this.closeLocal(entry.session, "closed");
    }
  }

  /**
   * CAS do controle DURÁVEL (SQL): agente → humano. Falha se perder a
   * corrida — exclusividade atômica entre instâncias.
   */
  async takeHumanControl(
    conversationId: string,
    userId: string
  ): Promise<ControllerChangeResult> {
    return this.changeController(conversationId, userId, "agent", "human");
  }

  /**
   * Humano → agente com guarda de ação em andamento: enquanto houver input
   * humano executando (human_action_until válido), a devolução falha com
   * ACTION_INFLIGHT — a ação nunca continua depois que o controle volta.
   */
  async releaseToAgent(
    conversationId: string,
    userId: string
  ): Promise<ControllerChangeResult> {
    return this.changeController(conversationId, userId, "human", "agent");
  }

  private async changeController(
    conversationId: string,
    userId: string,
    from: ComputerController,
    to: ComputerController
  ): Promise<ControllerChangeResult> {
    const record = await this.recordFor(conversationId, userId);
    if (!record) {
      return { ok: false, controller: from === "human" ? "human" : "agent", reason: "SESSION_NOT_FOUND" };
    }
    const ok = await this.store.casController(record.id, from, to);
    if (ok) {
      this.localForSessionId(record.id)?.session.compareAndSetController(from, to);
    }
    const after = await this.store.get(record.id);
    const controller = after?.controller ?? (ok ? to : from);
    const inflight =
      !ok && from === "human" && controller === "human" && (after?.humanActionUntil ?? 0) > this.now();
    return { ok, controller, reason: inflight ? "ACTION_INFLIGHT" : ok ? undefined : "CONTROL_CONFLICT" };
  }

  private localForSessionId(sessionId: string): ManagedEntry | null {
    return this.localSessions.get(sessionId) ?? null;
  }

  /**
   * INÍCIO de ação humana (mouse/teclado/scroll/navegação): garante canal,
   * controle humano VIGENTE no plano durável e marca a ação como em
   * andamento — enquanto marcada, devolver o controle é recusado.
   */
  async beginHumanAction(
    conversationId: string,
    userId: string
  ): Promise<
    | { ok: true; session: ComputerSession }
    | { ok: false; code: "SESSION_NOT_FOUND" | "CHANNEL_BUSY" | "NOT_HUMAN_CONTROLLED" | "ACTION_INFLIGHT" }
  > {
    const session = (await this.ensureSession(conversationId, userId)) ?? this.activeFor(conversationId, userId);
    if (!session) {
      const record = await this.store.findLiveByConversation(conversationId);
      return record && record.userId === userId
        ? { ok: false, code: "CHANNEL_BUSY" }
        : { ok: false, code: "SESSION_NOT_FOUND" };
    }
    const record = await this.store.get(session.id);
    if (!isLiveRecord(record)) return { ok: false, code: "SESSION_NOT_FOUND" };
    if (record.controller !== "human") return { ok: false, code: "NOT_HUMAN_CONTROLLED" };
    if (!(await this.store.setHumanActionInflight(session.id, this.now() + this.humanActionTtlMs))) {
      return { ok: false, code: "ACTION_INFLIGHT" };
    }
    return { ok: true, session };
  }

  /** FIM de ação humana: libera a marca e informa o controlador vigente. */
  async endHumanAction(sessionId: string): Promise<{ controller: ComputerController | null }> {
    await this.store.clearHumanAction(sessionId).catch(() => undefined);
    const record = await this.store.get(sessionId).catch(() => null);
    return { controller: isLiveRecord(record) ? record.controller : null };
  }

  /**
   * LOCK RENOVÁVEL de ação humana: `human_action_until` é renovado em loop
   * durante TODA a execução (navegação pode levar 30s > TTL fixo) e liberado
   * NO finally — sucesso, erro ou cancelamento. Enquanto o lock está vivo,
   * CAS humano→agente falha (ACTION_INFLIGHT): o agente NUNCA recebe o
   * controle com ação humana em voo.
   */
  async runHumanAction<T>(session: ComputerSession, action: () => Promise<T>): Promise<T> {
    const sessionId = session.snapshot().sessionId;
    let renewing = true;
    const renewal = (async () => {
      while (renewing) {
        await new Promise((resolve) => setTimeout(resolve, this.humanActionRenewIntervalMs).unref?.());
        if (!renewing) break;
        await this.store
          .renewHumanAction(sessionId, this.now() + this.humanActionTtlMs)
          .catch(() => undefined);
      }
    })();
    try {
      return await action();
    } finally {
      renewing = false;
      await this.store.clearHumanAction(sessionId).catch(() => undefined);
      await renewal.catch(() => undefined);
    }
  }

  /** View saneada LOCAL (rápida): NUNCA token, host do provedor ou URL com segredo. */
  view(conversationId?: string, userId?: string): SessionView {
    const provider = this.getProvider();
    const limits = provider.limits();
    const persist = this.store.describe();
    const unconfigured = !provider.isConfigured() ? computeUnconfiguredMessage() : null;
    const entry =
      conversationId && userId
        ? [...this.localSessions.values()].find(
            (e) => e.conversationId === conversationId && e.userId === userId
          ) ?? null
        : null;
    if (!entry) {
      return {
        sessionId: null,
        conversationId: null,
        provider: null,
        status: "offline",
        controller: "agent",
        createdAt: null,
        leaseExpiresAt: null,
        lastSeenAt: null,
        unitsUsed: 0,
        unitsBudget: toBudget(limits.monthlyBudgetUnits),
        error: unconfigured,
        activeElsewhere: this.localSessions.size > 0 || this.creating > 0,
        channelOwner: this.localSessions.size > 0 ? "here" : null,
        persist,
        limits,
      };
    }
    const snap = entry.session.snapshot();
    return {
      sessionId: snap.sessionId,
      conversationId: entry.conversationId,
      provider: snap.provider,
      status: snap.status,
      controller: snap.controller,
      createdAt: snap.createdAt,
      leaseExpiresAt: snap.leaseExpiresAt,
      lastSeenAt: snap.lastSeenAt,
      unitsUsed: this.unitsFromSnapshot(snap),
      unitsBudget: toBudget(limits.monthlyBudgetUnits),
      error: snap.error ?? unconfigured,
      activeElsewhere: false,
      channelOwner: "here",
      persist,
      limits,
    };
  }

  /** View DURÁVEL (fonte entre instâncias) — usada pelas rotas do Chat. */
  async durableView(conversationId?: string, userId?: string): Promise<SessionView> {
    const provider = this.getProvider();
    const limits = provider.limits();
    const persist = this.store.describe();
    const unconfigured = !provider.isConfigured() ? computeUnconfiguredMessage() : null;
    const local = this.activeFor(conversationId, userId);
    if (local) {
      await this.heartbeat(local).catch(() => undefined);
      const snap = local.snapshot();
      const record = await this.store.get(snap.sessionId);
      return {
        sessionId: snap.sessionId,
        conversationId: conversationId ?? null,
        provider: snap.provider,
        status: snap.status,
        controller: record?.controller ?? snap.controller,
        createdAt: snap.createdAt,
        leaseExpiresAt: record?.leaseExpiresAt ?? snap.leaseExpiresAt,
        lastSeenAt: snap.lastSeenAt,
        unitsUsed: record?.unitsUsed ?? this.unitsFromSnapshot(snap),
        unitsBudget: toBudget(limits.monthlyBudgetUnits),
        error: snap.error ?? record?.error ?? unconfigured,
        activeElsewhere: false,
        channelOwner: "here",
        persist,
        limits,
      };
    }
    const record = conversationId ? await this.store.findLiveByConversation(conversationId) : null;
    if (record && userId && record.userId === userId) {
      const channelLive = record.channelInstance !== null && (record.channelExpiresAt ?? 0) > this.now();
      return {
        sessionId: record.id,
        conversationId: conversationId ?? null,
        provider: record.provider,
        status: record.status,
        controller: record.controller,
        createdAt: record.createdAt,
        leaseExpiresAt: record.leaseExpiresAt,
        lastSeenAt: record.lastSeenAt,
        unitsUsed: record.unitsUsed,
        unitsBudget: toBudget(limits.monthlyBudgetUnits),
        error: record.error ?? unconfigured,
        activeElsewhere: false,
        channelOwner: channelLive ? (record.channelInstance === this.channelInstance ? "here" : "elsewhere") : "free",
        persist,
        limits,
      };
    }
    return {
      sessionId: null,
      conversationId: null,
      provider: null,
      status: "offline",
      controller: "agent",
      createdAt: null,
      leaseExpiresAt: null,
      lastSeenAt: null,
      unitsUsed: 0,
      unitsBudget: toBudget(limits.monthlyBudgetUnits),
      error: unconfigured,
      activeElsewhere: Boolean(record),
      channelOwner: null,
      persist,
      limits,
    };
  }

  /** Info de conexão autorizada para a UI — endpoints proxy do Plutão apenas. */
  connectionInfoFor(conversationId: string, userId: string): ComputerConnectionInfo | null {
    const session = this.activeFor(conversationId, userId);
    if (!session) return null;
    return session.connectionInfo(
      `/api/computer/${encodeURIComponent(conversationId)}/screen/stream`,
      `/api/computer/${encodeURIComponent(conversationId)}/session/input`
    );
  }
}

function toBudget(units: number): number {
  return units === Number.POSITIVE_INFINITY ? -1 : units;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "falha desconhecida";
}

export type UnconfiguredCode = "SELF_HOSTED_ENDPOINT_MISSING" | "BROWSERLESS_TOKEN_MISSING";

export function computeUnconfiguredCode(): UnconfiguredCode {
  return (process.env[COMPUTE_PROVIDER_ENV.name] ?? "").trim() === "self-hosted"
    ? "SELF_HOSTED_ENDPOINT_MISSING"
    : "BROWSERLESS_TOKEN_MISSING";
}

export function computeUnconfiguredMessage(code: UnconfiguredCode = computeUnconfiguredCode()): string {
  return code === "SELF_HOSTED_ENDPOINT_MISSING"
    ? "provedor self-hosted selecionado, mas o endpoint do navegador próprio não está configurado"
    : "computador remoto exige o token do provedor configurado no servidor";
}

function toReserveReason(error: unknown): "PROVIDER_UNCONFIGURED" | "QUOTA_EXHAUSTED" | "PROVIDER_UNAVAILABLE" {
  if (error instanceof ComputerProviderError) {
    if (error.reason === "QUOTA_EXHAUSTED") return "QUOTA_EXHAUSTED";
    if (error.reason === "PROVIDER_UNCONFIGURED") return "PROVIDER_UNCONFIGURED";
  }
  return "PROVIDER_UNAVAILABLE";
}

export const computerSessions = new ComputerSessionManager();

/** Apenas testes: limpa tudo por `reset` — inclui sessões ativas (sem close de rede). */
export function resetComputerSessionsForTests(): void {
  computerSessions.resetForTests();
}
