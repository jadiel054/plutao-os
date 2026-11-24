/**
 * Fases 1+4 — GERENCIADOR DE SESSÕES DO COMPUTADOR DO PLUTÃO.
 *
 * Responsabilidades neste módulo (nunca no provedor, nunca no frontend):
 *  - Escolha do provedor por ambiente (PLUTAO_COMPUTER_PROVIDER),
 *    sem tocar no Chat ao trocar de provedor.
 *  - UMA sessão simultânea por instalação (reserva atômica).
 *  - Autorização por usuário + conversa em toda operação.
 *  - Controle agente x humano EXCLUSIVO por compare-and-set — a troca é
 *    síncrona (sem await) e falha se perder a corrida. NÃO usa o
 *    last-write-wins de eventos como garantia de exclusividade: eventos
 *    são apenas o acompanhamento observável da sessão no Chat.
 *  - Lease/expiração de sessões abandonadas (TTL do provedor).
 *  - Cota: bloqueia novas sessões quando o orçamento gratuito acaba.
 *  - Segredos apenas no servidor; info de conexão autorizada não contém
 *    tokens nem endpoints do provedor.
 *
 * Garantia de atomicidade: a reserva e o CAS de controle são seções
 * síncronas do event-loop (sem await entre checar e atribuir) — atômicas
 * numa instância. Entre instâncias serverless distintas, a garantia forte
 * exigirá a tabela `computer_sessions` (INSERT condicional único) —
 * proposta de schema entregue ao ChatGPT e NÃO aplicada. Enquanto isso,
 * o limite instalado é: 1 sessão por instância ativa + lease curto.
 */
import { COMPUTE_PROVIDER_ENV } from "./env";
import {
  ComputerProviderError,
  type ComputerConnectionInfo,
  type ComputerController,
  type ComputerProvider,
  type ComputerSession,
  type ComputerSessionSnapshot,
} from "./provider";
import { createBrowserlessProvider, readBrowserlessConfig } from "./providers/browserless";
import { createSelfHostedProvider, readSelfHostedConfig } from "./providers/self-hosted";

export type ReserveReason =
  | "ok"
  | "PROVIDER_UNCONFIGURED"
  | "SESSION_LIMIT"
  | "QUOTA_EXHAUSTED"
  | "PROVIDER_UNAVAILABLE";

export type SessionManagerOptions = {
  now?: () => number;
  /** Injeta provedor (testes/troca programática); default: por ambiente. */
  providerFactory?: () => ComputerProvider;
};

type ManagedEntry = {
  session: ComputerSession;
  conversationId: string;
  userId: string;
  unitsBilled: number;
  billedAtMs: number;
};

export type SessionView = {
  sessionId: string | null;
  conversationId: string | null;
  provider: ComputerProvider["kind"] | null;
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
  limits: ComputerProvider["limits"] extends () => infer L ? L : never;
};

const UNIT_MS = 30_000;

export class ComputerSessionManager {
  private entry: ManagedEntry | null = null;
  /** Marca síncrona da reserva em andamento — fecha a janela de corrida entre
   * entrada nula e o await de criação do provedor (1 sessão por instalação). */
  private reserving = false;
  /** Units acumuladas de conexões encerradas + corrente (estimativa honesta). */
  private unitsSpentWindow = 0;
  private now: () => number;
  private providerFactory: () => ComputerProvider;

  constructor(options: SessionManagerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.providerFactory = options.providerFactory ?? (() => this.createEnvProvider());
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
    return this.getProvider().limits().monthlyBudgetUnits;
  }

  unitsUsed(): number {
    return this.unitsSpentWindow + (this.entry ? this.currentUnits(this.entry) : 0);
  }

  private currentUnits(entry: ManagedEntry): number {
    const snap = entry.session.snapshot();
    return Math.max(entry.unitsBilled, Math.ceil((snap.createdAt ? this.now() - snap.createdAt : 0) / UNIT_MS));
  }

  /**
   * RESERVA ATÔMICA: cria a sessão se, e somente se, não existir sessão
   * ativa e a cota sobrar. Seção síncrona até a atribuição (sem await).
   */
  async reserve(opts: {
    conversationId: string;
    userId: string;
  }): Promise<{ ok: true; session: ComputerSession } | { ok: false; reason: ReserveReason }> {
    const provider = this.getProvider();
    if (!provider.isConfigured()) return { ok: false, reason: "PROVIDER_UNCONFIGURED" };

    this.expireIfDue();
    if (this.entry || this.reserving) return { ok: false, reason: "SESSION_LIMIT" };
    if (provider.limits().monthlyBudgetUnits !== Number.POSITIVE_INFINITY && this.unitsUsed() >= this.unitsBudget()) {
      return { ok: false, reason: "QUOTA_EXHAUSTED" };
    }

    // Reserva síncrona ANTES do await: nenhuma criação paralela passa daqui
    // enquanto a conexão ao provedor está em andamento (sem double-open).
    this.reserving = true;
    let session: ComputerSession;
    try {
      session = await provider.createSession({ conversationId: opts.conversationId, userId: opts.userId });
    } catch (error) {
      this.reserving = false;
      return { ok: false, reason: toReserveReason(error) };
    }
    this.reserving = false;
    this.entry = { session, conversationId: opts.conversationId, userId: opts.userId, unitsBilled: 0, billedAtMs: this.now() };
    return { ok: true, session };
  }

  /** Sessão ativa SÓ se pertencer exatamente a este usuário e conversa. */
  activeFor(conversationId: string | null | undefined, userId: string): ComputerSession | null {
    this.expireIfDue();
    if (!this.entry || !conversationId) return null;
    if (this.entry.conversationId !== conversationId || this.entry.userId !== userId) return null;
    return this.entry.session;
  }

  anyActive(): ManagedEntry | null {
    this.expireIfDue();
    return this.entry;
  }

  /** Apenas testes: descarta sessão ativa sem rede. */
  resetForTests(): void {
    this.entry = null;
    this.unitsSpentWindow = 0;
    this.reserving = false;
  }

  /** Indicador de reserva em andamento (janela de criação da sessão). */
  isReserving(): boolean {
    return this.reserving;
  }

  /** Só a SESSÃO REMOTA: humano no controle para esta conversa+usuário. */
  isHumanInControlFor(conversationId: string, userId: string): boolean {
    const session = this.activeFor(conversationId, userId);
    return session ? session.snapshot().controller === "human" : false;
  }

  async closeConversation(conversationId: string, userId: string): Promise<boolean> {
    this.expireIfDue();
    if (!this.entry) return false;
    if (this.entry.conversationId !== conversationId || this.entry.userId !== userId) return false;
    await this.closeEntry();
    return true;
  }

  private async closeEntry(): Promise<void> {
    const entry = this.entry;
    this.entry = null;
    if (!entry) return;
    entry.unitsBilled = Math.max(entry.unitsBilled, this.currentUnits(entry));
    this.unitsSpentWindow += entry.unitsBilled;
    await entry.session.close().catch(() => undefined);
  }

  private expireIfDue(): void {
    if (!this.entry) return;
    const snap = this.entry.session.snapshot();
    const expiredByLease = snap.leaseExpiresAt > 0 && this.now() > snap.leaseExpiresAt + 5_000;
    if (!expiredByLease) return;
    // Expiração encerra sem cobrar demais: registra unidades e descarta.
    const orphan = this.entry;
    this.unitsSpentWindow += Math.max(
      orphan.unitsBilled,
      Math.ceil(Math.max(0, snap.leaseExpiresAt - snap.createdAt) / UNIT_MS)
    );
    this.entry = null;
    void orphan.session.close().catch(() => undefined);
  }

  /** Encerramento forçado (TTL do provedor, crash, ou troca de provedor). */
  async closeAll(): Promise<void> {
    await this.closeEntry();
  }

  /**
   * CAS do controle: agente → humano. Falha se a troca perder a corrida
   * (não existe takeover simultâneo).
   */
  async takeHumanControl(
    conversationId: string,
    userId: string
  ): Promise<{ ok: boolean; controller: ComputerController }> {
    const session = this.activeFor(conversationId, userId);
    if (!session) return { ok: false, controller: "agent" };
    return { ok: session.compareAndSetController("agent", "human"), controller: session.snapshot().controller };
  }

  async releaseToAgent(
    conversationId: string,
    userId: string
  ): Promise<{ ok: boolean; controller: ComputerController }> {
    const session = this.activeFor(conversationId, userId);
    if (!session) return { ok: false, controller: "agent" };
    return { ok: session.compareAndSetController("human", "agent"), controller: session.snapshot().controller };
  }

  /** View saneada: NUNCA token, host do provedor ou URL com segredo. */
  view(conversationId?: string, userId?: string): SessionView {
    this.expireIfDue();
    const provider = this.getProvider();
    const limits = provider.limits();
    const owned =
      conversationId && userId && this.entry && this.entry.conversationId === conversationId && this.entry.userId === userId
        ? this.entry
        : null;
    const error = !provider.isConfigured() ? computeUnconfiguredMessage() : null;
    if (!owned) {
      return {
        sessionId: null,
        conversationId: null,
        provider: null,
        status: "offline",
        controller: "agent",
        createdAt: null,
        leaseExpiresAt: null,
        lastSeenAt: null,
        unitsUsed: this.unitsUsed(),
        unitsBudget: limits.monthlyBudgetUnits === Number.POSITIVE_INFINITY ? -1 : limits.monthlyBudgetUnits,
        error,
        activeElsewhere: Boolean(this.entry) || this.reserving,
        limits,
      };
    }
    const snap = owned.session.snapshot();
    return {
      sessionId: snap.sessionId,
      conversationId: owned.conversationId,
      provider: snap.provider,
      status: snap.status,
      controller: snap.controller,
      createdAt: snap.createdAt,
      leaseExpiresAt: snap.leaseExpiresAt,
      lastSeenAt: snap.lastSeenAt,
      unitsUsed: Math.max(owned.unitsBilled, this.currentUnits(owned)),
      unitsBudget: limits.monthlyBudgetUnits === Number.POSITIVE_INFINITY ? -1 : limits.monthlyBudgetUnits,
      error: snap.error ?? error,
      activeElsewhere: false,
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
