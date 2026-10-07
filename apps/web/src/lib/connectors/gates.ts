/**
 * Write gate service — Princípio 1.
 *
 * H1: o gate é a ÚNICA autorização válida para uma escrita real.
 * Ciclo de vida:
 *
 *   pending ──approveGate──▶ approved ──consumeGateForWrite──▶ executing ──finalize──▶ executed | failed
 *      │
 *      └──markGateRejected──▶ rejected
 *
 * Regras de segurança (todas server-side):
 *   - o executor NUNCA aceita um booleano "aprovado" vindo do input;
 *   - `consumeGateForWrite` exige: gate do próprio usuário, provider e capability
 *     iguais, status `approved`, `payload_hash` idêntico ao payload que será
 *     executado, e consumo atômico (single-use);
 *   - `payload_hash` é calculado aqui a partir do payload normalizado, para que
 *     nenhum chamador possa esquecer de informá-lo.
 */

import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { createDb, writeGates, type WriteGateRow } from "@plutao/db";
import { computeGatePayloadHash } from "./gatePayload";
import { sanitizeError } from "@/lib/security/sanitize";

export type WriteGateStatus =
  | "pending"
  | "approved"
  | "executing"
  | "executed"
  | "failed"
  | "rejected";

const WRITE_GATE_TTL_MS = 15 * 60 * 1000;

export type CreateGateInput = {
  userId: string;
  missionId?: string | null;
  executionId?: string | null;
  provider: string;
  capability: string;
  target: string;
  summary: string;
  payload: Record<string, unknown>;
  contentPreview?: string | null;
};

export async function createWriteGate(input: CreateGateInput): Promise<WriteGateRow> {
  const payloadHash = computeGatePayloadHash(input.provider, input.capability, input.payload);
  try {
    const db = createDb();
    const [row] = await db
      .insert(writeGates)
      .values({
        userId: input.userId,
        missionId: input.missionId ?? null,
        executionId: input.executionId ?? null,
        provider: input.provider,
        capability: input.capability,
        target: input.target,
        summary: input.summary,
        payload: input.payload,
        payloadHash,
        contentPreview: input.contentPreview ?? null,
        status: "pending",
        expiresAt: new Date(Date.now() + WRITE_GATE_TTL_MS),
      })
      .returning();
    if (!row) throw new Error("failed to create write_gate");

    return row;
  } catch (err) {
    console.error("[createWriteGate error]", {
      provider: input.provider,
      capability: input.capability,
      target: input.target,
      userId: input.userId,
      missionId: input.missionId ?? null,
      error: sanitizeError(err),
    });
    throw err;
  }
}

export async function getWriteGate(gateId: string, userId: string) {
  const db = createDb();
  const [row] = await db
    .select()
    .from(writeGates)
    .where(and(eq(writeGates.id, gateId), eq(writeGates.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listPendingGates(userId: string, missionId?: string | null) {
  const db = createDb();
  const conditions = [eq(writeGates.userId, userId), eq(writeGates.status, "pending")];
  if (missionId) conditions.push(eq(writeGates.missionId, missionId));
  return db
    .select()
    .from(writeGates)
    .where(and(...conditions))
    .orderBy(desc(writeGates.createdAt))
    .limit(20);
}

export async function markGateRejected(gateId: string, userId: string) {
  const db = createDb();
  const [row] = await db
    .update(writeGates)
    .set({
      status: "rejected",
      decision: "rejected",
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(writeGates.id, gateId),
        eq(writeGates.userId, userId),
        eq(writeGates.status, "pending")
      )
    )
    .returning();
  return row ?? null;
}

/**
 * Aprovação humana: `pending` → `approved`.
 *
 * O `payload_hash` é gravado aqui. Para gates legados (criados antes da
 * migration 0020) o hash é calculado a partir do `payload` já persistido — o
 * mesmo que o humano viu na tela. Nenhum payload vindo do cliente é usado.
 */
export async function approveGate(gateId: string, userId: string) {
  const db = createDb();
  const existing = await getWriteGate(gateId, userId);
  if (!existing) return null;
  if (existing.status !== "pending") return null;

  const payloadHash =
    existing.payloadHash ??
    computeGatePayloadHash(
      existing.provider,
      existing.capability,
      (existing.payload ?? {}) as Record<string, unknown>
    );

  const [row] = await db
    .update(writeGates)
    .set({
      status: "approved",
      decision: "approved",
      decidedAt: new Date(),
      payloadHash,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(writeGates.id, gateId),
        eq(writeGates.userId, userId),
        eq(writeGates.status, "pending")
      )
    )
    .returning();
  return row ?? null;
}

export type ConsumeGateResult =
  | { ok: true; gate: WriteGateRow }
  | { ok: false; error: string; code: string };

/**
 * H1 — Validação server-side + consumo atômico (single-use).
 *
 * Chamada pelo executor no ponto público, imediatamente antes de executar a
 * escrita real. Se qualquer verificação falhar, a escrita NÃO acontece.
 */
export async function consumeGateForWrite(opts: {
  gateId: string;
  userId: string;
  provider: string;
  capability: string;
  payloadHash: string;
}): Promise<ConsumeGateResult> {
  const gate = await getWriteGate(opts.gateId, opts.userId);
  if (!gate) {
    return {
      ok: false,
      code: "GATE_NOT_FOUND",
      error:
        "Escrita recusada: o gate informado não existe ou pertence a outro usuário. Nenhuma aprovação humana foi validada.",
    };
  }
  if (gate.provider !== opts.provider) {
    return {
      ok: false,
      code: "GATE_PROVIDER_MISMATCH",
      error: `Escrita recusada: gate pertence ao provedor '${gate.provider}', não a '${opts.provider}'.`,
    };
  }
  if (gate.capability !== opts.capability) {
    return {
      ok: false,
      code: "GATE_CAPABILITY_MISMATCH",
      error: `Escrita recusada: gate foi aprovado para '${gate.capability}', não para '${opts.capability}'.`,
    };
  }
  if (gate.status !== "approved") {
    return {
      ok: false,
      code: "GATE_NOT_APPROVED",
      error: `Escrita recusada: gate em status '${gate.status}'. Apenas gates aprovados por humano podem executar.`,
    };
  }
  if (gate.expiresAt <= new Date()) {
    return {
      ok: false,
      code: "GATE_EXPIRED",
      error: "Escrita recusada: a aprovação deste gate expirou e não pode ser reutilizada.",
    };
  }
  if (!gate.payloadHash || gate.payloadHash !== opts.payloadHash) {
    return {
      ok: false,
      code: "GATE_PAYLOAD_MISMATCH",
      error:
        "Escrita recusada: o payload a executar difere do payload aprovado por humano (hash divergente).",
    };
  }

  const db = createDb();
  const now = new Date();
  const claimed = await db
    .update(writeGates)
    .set({
      status: "executing",
      consumedAt: now,
      consumedBy: opts.capability,
      updatedAt: now,
    })
    .where(
      and(
        eq(writeGates.id, opts.gateId),
        eq(writeGates.userId, opts.userId),
        eq(writeGates.status, "approved"),
        eq(writeGates.payloadHash, opts.payloadHash),
        gt(writeGates.expiresAt, now)
      )
    )
    .returning();

  if (!claimed[0]) {
    return {
      ok: false,
      code: "GATE_ALREADY_USED",
      error:
        "Escrita recusada: este gate já foi consumido por uma execução anterior (uso único).",
    };
  }

  return { ok: true, gate: claimed[0] };
}

/** Fecha o gate após a tentativa de execução. */
export async function finalizeGateExecution(
  gateId: string,
  userId: string,
  outcome: { ok: boolean; output?: string | null; error?: string | null }
) {
  const db = createDb();
  const [row] = await db
    .update(writeGates)
    .set({
      status: outcome.ok ? "executed" : "failed",
      executedAt: outcome.ok ? new Date() : null,
      result: outcome.ok ? { output: outcome.output ?? "" } : null,
      error: outcome.ok ? null : sanitizeError(outcome.error, "Execução falhou"),
      updatedAt: new Date(),
    })
    .where(and(eq(writeGates.id, gateId), eq(writeGates.userId, userId)))
    .returning();
  return row ?? null;
}

/**
 * Rede de segurança: aprovado mas nunca consumido pelo executor (ex.: capability
 * que não é de escrita). Marca como falha em vez de deixar o gate preso.
 */
export async function failUnconsumedGate(gateId: string, userId: string, reason: string) {
  const db = createDb();
  const [row] = await db
    .update(writeGates)
    .set({
      status: "failed",
      error: sanitizeError(reason, "Gate não consumido pela execução"),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(writeGates.id, gateId),
        eq(writeGates.userId, userId),
        eq(writeGates.status, "approved")
      )
    )
    .returning();
  return row ?? null;
}

/** Reaper idempotente chamado por cron; nenhum gate recuperado volta a ser aprovado. */
export async function reapExpiredWriteGates(staleExecutingMs = WRITE_GATE_TTL_MS) {
  const db = createDb();
  const now = new Date();
  const staleExecutingBefore = new Date(Date.now() - staleExecutingMs);
  const expired = await db
    .update(writeGates)
    .set({
      status: "failed",
      error: "Gate expirado antes da finalização.",
      updatedAt: now,
    })
    .where(and(lt(writeGates.expiresAt, now), inArray(writeGates.status, ["pending", "approved"])))
    .returning({ id: writeGates.id });
  const stale = await db
    .update(writeGates)
    .set({
      status: "failed",
      error: "Gate preso em execução e recuperado pelo reaper.",
      updatedAt: now,
    })
    .where(and(eq(writeGates.status, "executing"), lt(writeGates.updatedAt, staleExecutingBefore)))
    .returning({ id: writeGates.id });
  return { expired: expired.length, staleExecuting: stale.length };
}

/**
 * @deprecated Use `approveGate` + `consumeGateForWrite` + `finalizeGateExecution`.
 * Mantido apenas para compatibilidade de importação.
 */
export async function markGateApproved(
  gateId: string,
  userId: string,
  result?: Record<string, unknown> | null,
  error?: string | null
) {
  return finalizeGateExecution(gateId, userId, {
    ok: !error,
    output: typeof result?.output === "string" ? result.output : null,
    error: error ?? null,
  });
}
