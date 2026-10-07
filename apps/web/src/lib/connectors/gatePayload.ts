/**
 * H1 — Hash canônico do payload aprovado em um write gate.
 *
 * O gate aprovado só pode executar EXATAMENTE o payload que o humano viu.
 * Para isso:
 *   1. o executor normaliza o payload de escrita (`normalizeWritePayload`);
 *   2. cria o gate guardando `payload` normalizado + `payload_hash`;
 *   3. na execução, recalcula o hash do payload normalizado e compara.
 *
 * Qualquer divergência (campo extra, valor alterado, ação diferente) muda o hash
 * e a execução é recusada.
 */

import { createHash } from "node:crypto";

/** Serialização determinística: chaves ordenadas, `undefined` removido, sem espaços. */
export function stableStringify(value: unknown): string {
  const walk = (node: unknown): unknown => {
    if (node === undefined) return undefined;
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(walk);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(node as Record<string, unknown>).sort()) {
      const v = walk((node as Record<string, unknown>)[key]);
      if (v !== undefined) out[key] = v;
    }
    return out;
  };
  return JSON.stringify(walk(value) ?? null);
}

/**
 * Normaliza o payload de escrita: remove campos de controle do protocolo
 * (`_gateId`, `_gateApproved`, `action`, `missionId`) para que o hash represente
 * apenas a intenção de escrita aprovada.
 */
export function normalizeWritePayload(
  payload: Record<string, unknown>,
  controlKeys: readonly string[] = ["_gateId", "_gateApproved", "action", "missionId"]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (controlKeys.includes(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Hash estável de (provider, capability, payload normalizado).
 * É o valor persistido em `write_gates.payload_hash`.
 */
export function computeGatePayloadHash(
  provider: string,
  capability: string,
  payload: Record<string, unknown>
): string {
  const canonical = stableStringify({
    provider,
    capability,
    payload: normalizeWritePayload(payload),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
