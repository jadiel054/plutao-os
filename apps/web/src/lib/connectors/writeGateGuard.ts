/**
 * H1 + H9 — Guard único de escrita.
 *
 * Todo executor de conector passa por aqui antes de um efeito colateral real:
 *
 *   1. Registro de capacidades (H9): capacidade não registrada/desabilitada ou
 *      sem controle implementado → recusa imediata (fail-closed).
 *   2. Rate limit de escrita por usuário (janela deslizante em memória).
 *   3. Sem `_gateId` → cria write_gate `pending` e devolve GATE_PENDING.
 *      Com `_gateId` → valida no servidor (usuário, provider, capability,
 *      status `approved`, hash do payload) e consome atomicamente (single-use).
 *
 * O executor NUNCA decide por conta própria se pode escrever.
 */

import { createWriteGate, consumeGateForWrite, finalizeGateExecution } from "./gates";
import { computeGatePayloadHash } from "./gatePayload";
import { evaluateCapability } from "@/lib/capabilities/registry";
import { sanitizeError } from "@/lib/security/sanitize";

const WRITE_RATE_LIMIT = 20;
const WRITE_WINDOW_MS = 60_000;
const writeBuckets = new Map<string, number[]>();

/** Rate limit de escrita por usuário+provider. */
export function checkWriteRateLimit(
  userId: string,
  provider: string
): { ok: true } | { ok: false; retryAfterSec: number } {
  const key = `${userId}:${provider}`;
  const now = Date.now();
  const recent = (writeBuckets.get(key) ?? []).filter((t) => now - t < WRITE_WINDOW_MS);
  if (recent.length >= WRITE_RATE_LIMIT) {
    const oldest = recent[0] ?? now;
    writeBuckets.set(key, recent);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((WRITE_WINDOW_MS - (now - oldest)) / 1000)),
    };
  }
  recent.push(now);
  writeBuckets.set(key, recent);
  return { ok: true };
}

/** Test-only: limpa buckets de rate limit. */
export function __resetWriteRateLimitForTests() {
  writeBuckets.clear();
}

export type GateFinalize = (outcome: {
  ok: boolean;
  output?: string | null;
  error?: string | null;
}) => Promise<void>;

export type GateGuardResult =
  | { kind: "gate_pending"; gateId: string; output: string }
  | { kind: "approved"; gateId: string; finalize: GateFinalize }
  | { kind: "refused"; error: string; code: string };

export function gatePendingOutput(opts: {
  gateId: string;
  capability: string;
  target: string;
  summary: string;
}): string {
  return [
    "GATE_PENDING",
    `gate_id: ${opts.gateId}`,
    `capability: ${opts.capability}`,
    `target: ${opts.target}`,
    `summary: ${opts.summary}`,
    "Aguardando aprovação humana no chat (Princípio 1). Não execute write sem aprovação.",
  ].join("\n");
}

/**
 * Executa o fluxo de autorização de escrita.
 * Retorna `gate_pending` (nada executado), `approved` (pode executar; chame
 * `finalize` ao terminar) ou `refused` (nada executado).
 */
export async function guardWrite(opts: {
  userId: string;
  provider: string;
  capability: string;
  target: string;
  summary: string;
  payload: Record<string, unknown>;
  contentPreview?: string | null;
  missionId?: string | null;
  gateId?: string | null;
}): Promise<GateGuardResult> {
  // 1. Registro de capacidades (fail-closed).
  const decision = evaluateCapability(opts.provider, opts.capability);
  if (!decision.allowed) {
    return { kind: "refused", code: decision.reason, error: decision.message };
  }
  if (decision.entry.mode !== "write") {
    return {
      kind: "refused",
      code: "NOT_A_WRITE_CAPABILITY",
      error: `Capacidade '${decision.entry.id}' não é de escrita; o guard não deve ser usado para leitura.`,
    };
  }

  // 2. Rate limit de escrita.
  const rl = checkWriteRateLimit(opts.userId, opts.provider);
  if (!rl.ok) {
    return {
      kind: "refused",
      code: "RATE_LIMITED",
      error: `Muitas tentativas de escrita em ${opts.provider}. Tente novamente em ~${rl.retryAfterSec}s.`,
    };
  }

  // 3a. Sem gate → cria pedido de aprovação.
  if (!opts.gateId) {
    try {
      const gate = await createWriteGate({
        userId: opts.userId,
        missionId: opts.missionId ?? null,
        provider: opts.provider,
        capability: opts.capability,
        target: opts.target,
        summary: opts.summary,
        payload: opts.payload,
        contentPreview: opts.contentPreview ?? null,
      });
      return {
        kind: "gate_pending",
        gateId: gate.id,
        output: gatePendingOutput({
          gateId: gate.id,
          capability: opts.capability,
          target: opts.target,
          summary: opts.summary,
        }),
      };
    } catch (e) {
      console.error("[guardWrite createWriteGate error]", {
        provider: opts.provider,
        capability: opts.capability,
        error: sanitizeError(e),
      });
      return {
        kind: "refused",
        code: "GATE_CREATE_FAILED",
        error: `Não consegui iniciar a operação ${opts.capability}: ${sanitizeError(e, "falha ao criar write_gate")}`,
      };
    }
  }

  // 3b. Com gate → validação server-side + consumo atômico.
  const payloadHash = computeGatePayloadHash(opts.provider, opts.capability, opts.payload);
  const claim = await consumeGateForWrite({
    gateId: opts.gateId,
    userId: opts.userId,
    provider: opts.provider,
    capability: opts.capability,
    payloadHash,
  });
  if (!claim.ok) {
    return { kind: "refused", code: claim.code, error: claim.error };
  }

  const gateId = claim.gate.id;
  return {
    kind: "approved",
    gateId,
    finalize: async (outcome) => {
      try {
        await finalizeGateExecution(gateId, opts.userId, outcome);
      } catch (e) {
        console.error("[guardWrite finalize error]", { gateId, error: sanitizeError(e) });
      }
    },
  };
}
