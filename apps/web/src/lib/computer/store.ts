/**
 * Fases 1+4 — STORE DURÁVEL do Computador do Plutão (control plane).
 *
 * SEPARAÇÃO DE PLANOS (correção da auditoria da PR #204):
 *   - CONTROL PLANE: metadados da SESSÃO (reserva única, autorização,
 *     controller, cota, lease, canal) persistidos NO NEON via
 *     `computer_sessions` — atômicos entre instâncias Vercel.
 *   - DATA/LIVE PLANE: o canal vivo do Chromium (conexão CDP, screencast,
 *     input) é LOCAL À INSTÂNCIA que o abriu (`channel_instance`),
 *     re-attachável por lease heartbeat — outra instância assume abrindo
 *     navegador novo (no Free o estado do navegador não é preservado).
 *
 * Duas implementações com SEMÂNTICA IDÊNTICA:
 *   - MemorySessionStore: mesma disciplina de índice único/CAS/conta em um
 *     único objeto — usada nos testes e como fallback honesto.
 *   - NeonSessionStore: SQL cru (db.execute) contra `computer_sessions`;
 *     NÃO cria tabela nem roda migration — se a tabela não existe (42P01)
 *     degrada para memória (ResilientSessionStore) e o schema real fica a
 *     cargo do ChatGPT (ver docs/DB_PROPOSTA_COMPUTER_SESSIONS.md).
 *
 * Garantia da tabela (índice único parcial): UMA linha viva por instalação
 * (`((1)) WHERE closed_at IS NULL`), independente do status.
 */
import { sql } from "drizzle-orm";
import type { Db } from "@plutao/db";
import type {
  ComputerController,
  ComputerProviderKind,
  ComputerSessionStatus,
} from "./provider";

export const LIVE_STATUSES: readonly ComputerSessionStatus[] = ["creating", "ready", "reconnecting"];

export const UNIT_MS = 30_000;
/** Tolerância antes de declarar expirado (mesma do ciclo local). */
export const EXPIRE_TOLERANCE_MS = 5_000;
/** TTL da ação humana em andamento (auto-libera em crash da request). */
export const HUMAN_ACTION_TTL_MS = 5_000;
/** Lease do canal entre instâncias (renovado por heartbeat SSE/input). */
export const CHANNEL_LEASE_MS = 30_000;

export type SessionRecord = {
  id: string;
  conversationId: string;
  userId: string;
  status: ComputerSessionStatus;
  provider: ComputerProviderKind;
  controller: ComputerController;
  controllerChangedAt: number | null;
  leaseExpiresAt: number;
  lastSeenAt: number;
  unitsUsed: number;
  /** 'YYYY-MM' — contabilidade mensal durável da cota. */
  billingMonth: string;
  channelInstance: string | null;
  channelExpiresAt: number | null;
  humanActionUntil: number | null;
  /** FENCING TOKEN da ação humana em voo — só o dono deste token renova/libera. */
  humanActionToken: string | null;
  error: string | null;
  createdAt: number;
  closedAt: number | null;
};

export type StoreReserveInput = {
  sessionId: string;
  conversationId: string;
  userId: string;
  provider: ComputerProviderKind;
  leaseExpiresAt: number;
  /** Number.POSITIVE_INFINITY = sem cota monetária (self-hosted). */
  monthlyBudgetUnits: number;
};

export type StoreReserveOutcome =
  | { ok: true }
  | { ok: false; reason: "SESSION_LIMIT" | "QUOTA_EXHAUSTED" };

export type AttachOutcome = "ok" | "BUSY" | "NOT_FOUND";

export type StoreDescribe = { mode: "memory" | "neon"; degraded: boolean };

export type RenewPatch = {
  lastSeenAt?: number;
  leaseExpiresAt?: number;
  status?: ComputerSessionStatus;
  /** Unidades CUMULATIVAS do provedor — store mantém o máximo (sem duplicar). */
  unitsUsed?: number;
  error?: string | null;
};

export type SessionStore = {
  readonly mode: "memory" | "neon";
  describe(): StoreDescribe;
  /** Gate atômico de reserva: 0 linhas vivas por instalação + cota mensal. */
  tryReserve(input: StoreReserveInput): Promise<StoreReserveOutcome>;
  get(id: string): Promise<SessionRecord | null>;
  findLiveByConversation(conversationId: string): Promise<SessionRecord | null>;
  /** CAS durável do controle; devolução falha com ação humana em andamento. */
  casController(id: string, from: ComputerController, to: ComputerController): Promise<boolean>;
  /** Marca ação em andamento COM fENCING TOKEN — só este token renova/libera. */
  setHumanActionInflight(id: string, until: number, token: string): Promise<boolean>;
  /**
   * Renova o lock de ação por TOKEN: um CAS explícito — a ação antiga (token
   * diferente, ex. após expirar o TTL e outra ação assumir) NÃO renova o
   * lock da ação mais recente.
   */
  renewHumanAction(id: string, until: number, token: string): Promise<boolean>;
  /**
   * Libera o lock pelo TOKEN: liberações STALE (ação antiga correndo atrás de
   * uma mais recente) não afetam o lock da ação atual.
   */
  clearHumanAction(id: string, token: string): Promise<boolean>;
  /** Dono do canal vivo; steal-só-se-expirado entre instâncias. */
  attachChannel(id: string, instanceId: string, leaseMs: number): Promise<AttachOutcome>;
  renewChannel(id: string, instanceId: string, leaseMs: number): Promise<boolean>;
  releaseChannel(id: string, instanceId: string): Promise<void>;
  renew(id: string, patch: RenewPatch): Promise<SessionRecord | null>;
  close(id: string, status: ComputerSessionStatus, error?: string | null): Promise<void>;
  monthlyUnitsUsed(monthKey: string): Promise<number>;
  sweepExpired(): Promise<number>;
};

export function isLiveStatus(status: ComputerSessionStatus): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status);
}

export function isLiveRecord(record: SessionRecord | null | undefined): record is SessionRecord {
  return Boolean(record && record.closedAt === null && isLiveStatus(record.status));
}

export function monthKeyOf(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7);
}

/* ------------------------------------------------------------------ */
/* Memória — mesmas semânticas, injetável no relógio (testes/fallback) */
/* ------------------------------------------------------------------ */

export class MemorySessionStore implements SessionStore {
  readonly mode = "memory" as const;
  private rows = new Map<string, SessionRecord>();
  private now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  describe(): StoreDescribe {
    return { mode: "memory", degraded: false };
  }

  private sweepRow(row: SessionRecord): boolean {
    if (row.closedAt !== null || !isLiveStatus(row.status)) return false;
    if (row.leaseExpiresAt + EXPIRE_TOLERANCE_MS > this.now()) return false;
    row.status = "expired";
    row.closedAt = this.now();
    this.accountWallClockUnits(row);
    return true;
  }

  private accountWallClockUnits(row: SessionRecord): void {
    if (row.closedAt === null) return;
    const elapsed = Math.max(0, row.closedAt - row.createdAt);
    row.unitsUsed = Math.max(row.unitsUsed, Math.ceil(elapsed / UNIT_MS));
  }

  private sweep(): number {
    let count = 0;
    for (const row of this.rows.values()) {
      if (this.sweepRow(row)) count += 1;
    }
    return count;
  }

  private sumMonth(monthKey: string): number {
    let total = 0;
    for (const row of this.rows.values()) {
      if (row.billingMonth === monthKey) total += row.unitsUsed;
    }
    return total;
  }

  async tryReserve(input: StoreReserveInput): Promise<StoreReserveOutcome> {
    this.sweep();
    for (const row of this.rows.values()) {
      if (row.closedAt === null && isLiveStatus(row.status)) {
        return { ok: false, reason: "SESSION_LIMIT" };
      }
    }
    if (input.monthlyBudgetUnits !== Number.POSITIVE_INFINITY) {
      const used = this.sumMonth(monthKeyOf(this.now()));
      if (used >= input.monthlyBudgetUnits) {
        return { ok: false, reason: "QUOTA_EXHAUSTED" };
      }
    }
    const now = this.now();
    this.rows.set(input.sessionId, {
      id: input.sessionId,
      conversationId: input.conversationId,
      userId: input.userId,
      status: "creating",
      provider: input.provider,
      controller: "agent",
      controllerChangedAt: null,
      leaseExpiresAt: input.leaseExpiresAt,
      lastSeenAt: now,
      unitsUsed: 0,
      billingMonth: monthKeyOf(now),
      channelInstance: null,
      channelExpiresAt: null,
      humanActionUntil: null,
      humanActionToken: null,
      error: null,
      createdAt: now,
      closedAt: null,
    });
    return { ok: true };
  }

  async get(id: string): Promise<SessionRecord | null> {
    this.sweep();
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async findLiveByConversation(conversationId: string): Promise<SessionRecord | null> {
    this.sweep();
    for (const row of this.rows.values()) {
      if (row.closedAt === null && isLiveStatus(row.status) && row.conversationId === conversationId) {
        return { ...row };
      }
    }
    return null;
  }

  async casController(id: string, from: ComputerController, to: ComputerController): Promise<boolean> {
    this.sweep();
    const row = this.rows.get(id);
    if (!isLiveRecord(row)) return false;
    if (row.controller !== from) return false;
    if (
      from === "human" &&
      to === "agent" &&
      row.humanActionUntil !== null &&
      row.humanActionUntil > this.now()
    ) {
      return false;
    }
    row.controller = to;
    row.controllerChangedAt = this.now();
    row.humanActionUntil = null;
    row.humanActionToken = null;
    return true;
  }

  async setHumanActionInflight(id: string, until: number, token: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!isLiveRecord(row)) return false;
    const now = this.now();
    if (row.controller !== "human") return false;
    if (row.humanActionUntil !== null && row.humanActionUntil > now) return false;
    row.humanActionUntil = until;
    row.humanActionToken = token;
    return true;
  }

  async renewHumanAction(id: string, until: number, token: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!isLiveRecord(row) || row.controller !== "human") return false;
    if (row.humanActionToken !== token) return false;
    row.humanActionUntil = Math.max(row.humanActionUntil ?? 0, until);
    return true;
  }

  async clearHumanAction(id: string, token: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.humanActionToken !== token) return false;
    row.humanActionUntil = null;
    row.humanActionToken = null;
    return true;
  }

  async attachChannel(id: string, instanceId: string, leaseMs: number): Promise<AttachOutcome> {
    const row = this.rows.get(id);
    if (!isLiveRecord(row)) return "NOT_FOUND";
    const now = this.now();
    if (
      row.channelInstance !== null &&
      row.channelInstance !== instanceId &&
      row.channelExpiresAt !== null &&
      row.channelExpiresAt > now
    ) {
      return "BUSY";
    }
    row.channelInstance = instanceId;
    row.channelExpiresAt = now + leaseMs;
    return "ok";
  }

  async renewChannel(id: string, instanceId: string, leaseMs: number): Promise<boolean> {
    const row = this.rows.get(id);
    if (!isLiveRecord(row)) return false;
    if (row.channelInstance !== instanceId) return false;
    row.channelExpiresAt = this.now() + leaseMs;
    return true;
  }

  async releaseChannel(id: string, instanceId: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.channelInstance === instanceId) {
      row.channelInstance = null;
      row.channelExpiresAt = null;
    }
  }

  async renew(id: string, patch: RenewPatch): Promise<SessionRecord | null> {
    const row = this.rows.get(id);
    if (!isLiveRecord(row)) return null;
    if (patch.lastSeenAt !== undefined) row.lastSeenAt = Math.max(row.lastSeenAt, patch.lastSeenAt);
    if (patch.leaseExpiresAt !== undefined) row.leaseExpiresAt = Math.max(row.leaseExpiresAt, patch.leaseExpiresAt);
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.unitsUsed !== undefined) row.unitsUsed = Math.max(row.unitsUsed, patch.unitsUsed);
    if (patch.error !== undefined) row.error = patch.error;
    return { ...row };
  }

  async close(id: string, status: ComputerSessionStatus, error?: string | null): Promise<void> {
    const row = this.rows.get(id);
    if (!row || row.closedAt !== null) return;
    row.status = status;
    row.closedAt = this.now();
    row.humanActionUntil = null;
    row.humanActionToken = null;
    row.channelInstance = null;
    row.channelExpiresAt = null;
    this.accountWallClockUnits(row);
    if (error) row.error = error;
  }

  async monthlyUnitsUsed(monthKey: string): Promise<number> {
    this.sweep();
    return this.sumMonth(monthKey);
  }

  async sweepExpired(): Promise<number> {
    return this.sweep();
  }

  /** Apenas testes: esvazia o store. */
  resetForTests(): void {
    this.rows.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Neon — SQL cru via db.execute (sem migration, sem DDL)              */
/* ------------------------------------------------------------------ */

function pgCode(error: unknown): string | null {
  const direct = (error as { code?: string } | null)?.code;
  if (typeof direct === "string") return direct;
  const cause = (error as { cause?: { code?: string } } | null)?.cause?.code;
  return typeof cause === "string" ? cause : null;
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Row = Record<string, unknown>;

function toMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  if (typeof value === "number") return value;
  return 0;
}

function toRecord(row: Row): SessionRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    userId: String(row.user_id),
    status: row.status as ComputerSessionStatus,
    provider: row.provider as ComputerProviderKind,
    controller: row.controller as ComputerController,
    controllerChangedAt: row.controller_changed_at ? toMs(row.controller_changed_at) : null,
    leaseExpiresAt: toMs(row.lease_expires_at),
    lastSeenAt: toMs(row.last_seen_at),
    unitsUsed: Number(row.units_used ?? 0),
    billingMonth: String(row.billing_month),
    channelInstance:
      row.channel_instance === null || row.channel_instance === undefined
        ? null
        : String(row.channel_instance),
    channelExpiresAt: row.channel_expires_at ? toMs(row.channel_expires_at) : null,
    humanActionUntil: row.human_action_until ? toMs(row.human_action_until) : null,
    humanActionToken:
      row.human_action_token === null || row.human_action_token === undefined
        ? null
        : String(row.human_action_token),
    error: row.error === null || row.error === undefined ? null : String(row.error),
    createdAt: toMs(row.created_at),
    closedAt: row.closed_at === null || row.closed_at === undefined ? null : toMs(row.closed_at),
  };
}

export class NeonSessionStore implements SessionStore {
  readonly mode = "neon" as const;
  private tableExistsCache: boolean | null = null;

  constructor(private readonly db: () => Db) {}

  describe(): StoreDescribe {
    return { mode: "neon", degraded: this.tableExistsCache === false };
  }

  /** Erro de tabela ausente (migration ainda não aplicada pelo ChatGPT). */
  async assertTable(): Promise<void> {
    if (this.tableExistsCache !== null && this.tableExistsCache) return;
    const result = (await this.db().execute(
      sql`SELECT to_regclass('public.computer_sessions') AS reg`
    )) as unknown as { rows: Row[] };
    const reg = result.rows?.[0]?.reg;
    this.tableExistsCache = reg !== null && reg !== undefined;
    if (!this.tableExistsCache) {
      const error = new Error('relation "computer_sessions" does not exist') as Error & { code?: string };
      error.code = "42P01";
      throw error;
    }
  }

  async tryReserve(input: StoreReserveInput): Promise<StoreReserveOutcome> {
    await this.assertTable();
    await this.sweepExpired();
    const nowMs = Date.now();
    try {
      // GATE ATÔMICO: o índice único parcial ((1)) WHERE closed_at IS NULL
      // recusa a 2ª linha viva de qualquer instância (23505 → SESSION_LIMIT).
      await this.db().execute(sql`
        INSERT INTO computer_sessions
          (id, conversation_id, user_id, status, provider, controller,
           lease_expires_at, last_seen_at, units_used, billing_month, created_at)
        VALUES (
          ${input.sessionId}, ${input.conversationId}, ${input.userId},
          'creating', ${input.provider}, 'agent',
          ${new Date(input.leaseExpiresAt)}, ${new Date(nowMs)}, 0,
          ${monthKeyOf(nowMs)}, ${new Date(nowMs)}
        )
      `);
    } catch (error) {
      if (pgCode(error) === "23505") return { ok: false, reason: "SESSION_LIMIT" };
      throw error;
    }
    if (input.monthlyBudgetUnits !== Number.POSITIVE_INFINITY) {
      const used = await this.monthlyUnitsUsed(monthKeyOf(nowMs));
      if (used >= input.monthlyBudgetUnits) {
        await this.close(input.sessionId, "closed", "cota mensal esgotada no momento da reserva");
        return { ok: false, reason: "QUOTA_EXHAUSTED" };
      }
    }
    return { ok: true };
  }

  async get(id: string): Promise<SessionRecord | null> {
    const result = (await this.db().execute(
      sql`SELECT * FROM computer_sessions WHERE id = ${id} LIMIT 1`
    )) as unknown as { rows: Row[] };
    const row = result.rows?.[0];
    return row ? toRecord(row) : null;
  }

  async findLiveByConversation(conversationId: string): Promise<SessionRecord | null> {
    await this.sweepExpired();
    const result = (await this.db().execute(sql`
      SELECT * FROM computer_sessions
      WHERE conversation_id = ${conversationId} AND closed_at IS NULL
        AND status IN ('creating', 'ready', 'reconnecting')
      ORDER BY created_at DESC LIMIT 1
    `)) as unknown as { rows: Row[] };
    const row = result.rows?.[0];
    return row ? toRecord(row) : null;
  }

  async casController(
    id: string,
    from: ComputerController,
    to: ComputerController
  ): Promise<boolean> {
    await this.assertTable();
    const inflightGuard =
      from === "human"
        ? sql` AND (human_action_until IS NULL OR human_action_until < now())`
        : sql``;
    const result = (await this.db().execute(sql`
      UPDATE computer_sessions
      SET controller = ${to}, controller_changed_at = now(),
          human_action_until = NULL, human_action_token = NULL
      WHERE id = ${id} AND controller = ${from} AND closed_at IS NULL${inflightGuard}
      RETURNING id
    `)) as unknown as { rows: Row[] };
    return Number(result.rows?.length ?? 0) > 0;
  }

  async setHumanActionInflight(id: string, until: number, token: string): Promise<boolean> {
    const result = (await this.db().execute(sql`
      UPDATE computer_sessions
      SET human_action_until = ${new Date(until)}, human_action_token = ${token}
      WHERE id = ${id} AND closed_at IS NULL AND controller = 'human'
        AND (human_action_until IS NULL OR human_action_until < now())
      RETURNING id
    `)) as unknown as { rows: Row[] };
    return Number(result.rows?.length ?? 0) > 0;
  }

  async renewHumanAction(id: string, until: number, token: string): Promise<boolean> {
    const result = (await this.db().execute(sql`
      UPDATE computer_sessions
      SET human_action_until = ${new Date(until)}
      WHERE id = ${id} AND closed_at IS NULL AND controller = 'human'
        AND human_action_token = ${token}
      RETURNING id
    `)) as unknown as { rows: Row[] };
    return Number(result.rows?.length ?? 0) > 0;
  }

  async clearHumanAction(id: string, token: string): Promise<boolean> {
    const result = (await this.db().execute(sql`
      UPDATE computer_sessions
      SET human_action_until = NULL, human_action_token = NULL
      WHERE id = ${id} AND human_action_token = ${token}
      RETURNING id
    `)) as unknown as { rows: Row[] };
    return Number(result.rows?.length ?? 0) > 0;
  }

  async attachChannel(id: string, instanceId: string, leaseMs: number): Promise<AttachOutcome> {
    const record = await this.get(id);
    if (!isLiveRecord(record)) return "NOT_FOUND";
    if (
      record.channelInstance !== null &&
      record.channelInstance !== instanceId &&
      record.channelExpiresAt !== null &&
      record.channelExpiresAt > Date.now()
    ) {
      return "BUSY";
    }
    // Condicional no UPDATE: só assume o canal se continuar livre/expirado.
    const result = (await this.db().execute(sql`
      UPDATE computer_sessions
      SET channel_instance = ${instanceId},
          channel_expires_at = now() + ${leaseMs} * interval '1 millisecond'
      WHERE id = ${id} AND closed_at IS NULL
        AND (channel_instance IS NULL OR channel_instance = ${instanceId}
             OR channel_expires_at < now())
      RETURNING id
    `)) as unknown as { rows: Row[] };
    return Number(result.rows?.length ?? 0) > 0 ? "ok" : "BUSY";
  }

  async renewChannel(id: string, instanceId: string, leaseMs: number): Promise<boolean> {
    const result = (await this.db().execute(sql`
      UPDATE computer_sessions
      SET channel_expires_at = now() + ${leaseMs} * interval '1 millisecond',
          last_seen_at = now()
      WHERE id = ${id} AND channel_instance = ${instanceId} AND closed_at IS NULL
      RETURNING id
    `)) as unknown as { rows: Row[] };
    return Number(result.rows?.length ?? 0) > 0;
  }

  async releaseChannel(id: string, instanceId: string): Promise<void> {
    await this.db().execute(sql`
      UPDATE computer_sessions
      SET channel_instance = NULL, channel_expires_at = NULL
      WHERE id = ${id} AND channel_instance = ${instanceId}
    `);
  }

  async renew(id: string, patch: RenewPatch): Promise<SessionRecord | null> {
    await this.assertTable();
    // Contabilidade sem duplicação: GREATEST mantém o maior valor cumulativo
    // informado pelo dono do canal (só há um dono por lease).
    const result = (await this.db().execute(sql`
      UPDATE computer_sessions
      SET last_seen_at = GREATEST(last_seen_at, COALESCE(${patch.lastSeenAt !== undefined ? new Date(patch.lastSeenAt) : null}, last_seen_at)),
          lease_expires_at = GREATEST(lease_expires_at, COALESCE(${patch.leaseExpiresAt !== undefined ? new Date(patch.leaseExpiresAt) : null}, lease_expires_at)),
          units_used = GREATEST(units_used, COALESCE(${patch.unitsUsed !== undefined ? Math.max(0, Math.floor(patch.unitsUsed)) : null}, units_used)),
          status = COALESCE(${patch.status ?? null}, status),
          error = COALESCE(${patch.error !== undefined ? patch.error : null}, error)
      WHERE id = ${id} AND closed_at IS NULL
      RETURNING *
    `)) as unknown as { rows: Row[] };
    const row = result.rows?.[0];
    return row ? toRecord(row) : null;
  }

  async close(id: string, status: ComputerSessionStatus, error?: string | null): Promise<void> {
    // Contabiliza o consumo real mesmo sem heartbeat: qualquer fechamento
    // (explicito, erro ou sweep) garante no ledger as unidades de tempo de
    // parede decorridas (created_at → now), sem depender da instância dona.
    await this.db().execute(sql`
      UPDATE computer_sessions
      SET status = ${status}, closed_at = now(), human_action_until = NULL,
          human_action_token = NULL,
          channel_instance = NULL, channel_expires_at = NULL,
          units_used = GREATEST(
            units_used,
            CEIL(EXTRACT(EPOCH FROM (now() - created_at)) / ${UNIT_MS / 1000})::int
          ),
          error = COALESCE(${error ?? null}, error)
      WHERE id = ${id} AND closed_at IS NULL
    `);
  }

  async monthlyUnitsUsed(monthKey: string): Promise<number> {
    const result = (await this.db().execute(sql`
      SELECT COALESCE(SUM(units_used), 0) AS used FROM computer_sessions
      WHERE billing_month = ${monthKey}
    `)) as unknown as { rows: Row[] };
    return Number(result.rows?.[0]?.used ?? 0);
  }

  async sweepExpired(): Promise<number> {
    // Mesma contabilidade do close(): a sessão abandonada entra no ledger
    // mensal com o tempo de parede consumido antes de perder o status vivo.
    const result = (await this.db().execute(sql`
      UPDATE computer_sessions
      SET status = 'expired', closed_at = now(), human_action_until = NULL,
          human_action_token = NULL,
          channel_instance = NULL, channel_expires_at = NULL,
          units_used = GREATEST(
            units_used,
            CEIL(EXTRACT(EPOCH FROM (now() - created_at)) / ${UNIT_MS / 1000})::int
          )
      WHERE closed_at IS NULL AND status IN ('creating', 'ready', 'reconnecting')
        AND lease_expires_at + ${EXPIRE_TOLERANCE_MS} * interval '1 millisecond' < now()
      RETURNING id
    `)) as unknown as { rows: Row[] };
    return Number(result.rows?.length ?? 0);
  }
}

/* ------------------------------------------------------------------ */
/* Resiliente — Neon com degradação honesta para memória               */
/* ------------------------------------------------------------------ */

/**
 * Wrapper usado pelo gerenciador: tenta o store Neon; se a tabela não
 * existe (42P01) ou o banco não está configurado, degrada UMA vez para
 * memória e passa a reportar `degraded: true` na view (UI informa
 * garantias reduzidas). Nenhum DDL é executado em nenhuma hipótese.
 */
/**
 * Erro tipado quando o control plane durável NÃO está disponível e a política
 * NÃO permite degradar para memória (produção): nenhuma sessão real deve ser
 * aberta sem garantia de exclusividade/cota entre instâncias.
 */
export class PersistenceUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      "Control plane durável indisponível (tabela computer_sessions ausente ou Neon inacessível) — recusando sessão real em produção.",
      cause instanceof Error ? { cause } : { cause: new Error(String(cause)) }
    );
    this.name = "PersistenceUnavailableError";
  }
}

export class ResilientSessionStore implements SessionStore {
  readonly mode = "neon" as const;
  private fallback: SessionStore;
  private degraded = false;
  private primaryNeon: NeonSessionStore | null = null;

  constructor(
    private readonly makeDb: () => Db,
    fallback?: SessionStore,
    private readonly allowDegraded: boolean = process.env.NODE_ENV !== "production"
  ) {
    this.fallback = fallback ?? new MemorySessionStore();
  }

  describe(): StoreDescribe {
    return this.degraded
      ? { mode: "memory", degraded: true }
      : { mode: "neon", degraded: false };
  }

  private isTableMissing(error: unknown): boolean {
    return pgCode(error) === "42P01" || /relation .*computer_sessions.* does not exist/i.test(errMsg(error));
  }

  private isUnusableDbClient(error: unknown): boolean {
    return error instanceof TypeError && /\.execute is not a function/i.test(errMsg(error));
  }

  private primary(): NeonSessionStore {
    if (!this.primaryNeon) this.primaryNeon = new NeonSessionStore(this.makeDb);
    return this.primaryNeon;
  }

  private degrade(error: unknown): void {
    if (!this.allowDegraded) {
      throw new PersistenceUnavailableError(error);
    }
    this.degraded = true;
    console.error(
      "[computer/store] store Neon indisponível — degradando para memória (sem garantia entre instâncias):",
      errMsg(error)
    );
  }

  private async run<T>(
    op: (store: SessionStore) => Promise<T>,
    fallbackOp: (fallback: SessionStore) => Promise<T>
  ): Promise<T> {
    if (this.degraded) {
      // Defesa em profundidade: um estado degradado persistente é inválido
      // fora de dev/test — nenhuma operação pode silenciosamente usar memória.
      if (!this.allowDegraded) throw new PersistenceUnavailableError(new Error("store degradado sem permissão"));
      return fallbackOp(this.fallback);
    }
    try {
      return await op(this.primary());
    } catch (error) {
      // FAIL-CLOSED INCONDICIONAL EM PRODUÇÃO: ANTES de qualquer classificação,
      // sem `allowDegraded` NENHUM erro dá fallback para memória — inclusive
      // 42P01 (tabela ausente), DATABASE_URL ausente, cliente DB indisponível
      // e erro de rede. Fallback em memória é EXCLUSIVO de dev/test.
      if (!this.allowDegraded) {
        throw new PersistenceUnavailableError(error);
      }
      if (
        this.isTableMissing(error) ||
        this.isUnusableDbClient(error) ||
        /DATABASE_URL is not set/i.test(errMsg(error))
      ) {
        this.degrade(error);
        return fallbackOp(this.fallback);
      }
      throw error;
    }
  }

  tryReserve(input: StoreReserveInput) {
    return this.run(
      (store) => store.tryReserve(input),
      (fallback) => fallback.tryReserve(input)
    );
  }

  get(id: string) {
    return this.run(
      (store) => store.get(id),
      (fallback) => fallback.get(id)
    );
  }

  findLiveByConversation(conversationId: string) {
    return this.run(
      (store) => store.findLiveByConversation(conversationId),
      (fallback) => fallback.findLiveByConversation(conversationId)
    );
  }

  casController(id: string, from: ComputerController, to: ComputerController) {
    return this.run(
      (store) => store.casController(id, from, to),
      (fallback) => fallback.casController(id, from, to)
    );
  }

  setHumanActionInflight(id: string, until: number, token: string) {
    return this.run(
      (store) => store.setHumanActionInflight(id, until, token),
      (fallback) => fallback.setHumanActionInflight(id, until, token)
    );
  }

  renewHumanAction(id: string, until: number, token: string) {
    return this.run(
      (store) => store.renewHumanAction(id, until, token),
      (fallback) => fallback.renewHumanAction(id, until, token)
    );
  }

  clearHumanAction(id: string, token: string) {
    return this.run(
      (store) => store.clearHumanAction(id, token),
      (fallback) => fallback.clearHumanAction(id, token)
    );
  }

  attachChannel(id: string, instanceId: string, leaseMs: number) {
    return this.run(
      (store) => store.attachChannel(id, instanceId, leaseMs),
      (fallback) => fallback.attachChannel(id, instanceId, leaseMs)
    );
  }

  renewChannel(id: string, instanceId: string, leaseMs: number) {
    return this.run(
      (store) => store.renewChannel(id, instanceId, leaseMs),
      (fallback) => fallback.renewChannel(id, instanceId, leaseMs)
    );
  }

  releaseChannel(id: string, instanceId: string) {
    return this.run(
      (store) => store.releaseChannel(id, instanceId),
      (fallback) => fallback.releaseChannel(id, instanceId)
    );
  }

  renew(id: string, patch: RenewPatch) {
    return this.run(
      (store) => store.renew(id, patch),
      (fallback) => fallback.renew(id, patch)
    );
  }

  close(id: string, status: ComputerSessionStatus, error?: string | null) {
    return this.run(
      (store) => store.close(id, status, error),
      (fallback) => fallback.close(id, status, error)
    );
  }

  monthlyUnitsUsed(monthKey: string) {
    return this.run(
      (store) => store.monthlyUnitsUsed(monthKey),
      (fallback) => fallback.monthlyUnitsUsed(monthKey)
    );
  }

  sweepExpired() {
    return this.run(
      (store) => store.sweepExpired(),
      (fallback) => fallback.sweepExpired()
    );
  }
}
