import { inArray, and, eq } from "drizzle-orm";
import { writeGates } from "@plutao/db";
import { getDb } from "@/lib/db";
import { extractGateId, mapGateStatusToUi, type WriteGateMinimalRow } from "./gateStatus";

/**
 * Coleta gate_ids dos steps e trace em mensagens de assistente.
 */
export function extractGateIdsFromMessages(messages: Array<{ role: string; metadata?: unknown }>): string[] {
  const gateIds = new Set<string>();

  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.metadata || typeof msg.metadata !== "object") {
      continue;
    }
    const meta = msg.metadata as Record<string, unknown>;

    if (Array.isArray(meta.steps)) {
      for (const step of meta.steps) {
        if (typeof step === "object" && step !== null && (step as Record<string, unknown>).type === "tool_call") {
          const tc = (step as Record<string, unknown>).toolCall as Record<string, unknown> | undefined;
          if (tc) {
            const outText = String(tc.summaryOutput || tc.fullOutput || "");
            const id = extractGateId(outText) || (typeof tc.gateId === "string" ? tc.gateId : null);
            if (id) gateIds.add(id);
          }
        }
      }
    }

    if (meta.trace && typeof meta.trace === "object") {
      const trace = meta.trace as Record<string, unknown>;
      if (Array.isArray(trace.toolCalls)) {
        for (const tc of trace.toolCalls as Array<Record<string, unknown>>) {
          const outText = String(tc.summaryOutput || tc.fullOutput || "");
          const id = extractGateId(outText) || (typeof tc.gateId === "string" ? tc.gateId : null);
          if (id) gateIds.add(id);
        }
      }
    }
  }

  return Array.from(gateIds);
}

/**
 * Consulta writeGates filtrando por IDs e userId do usuário.
 * Retorna apensas id, status, expiresAt, result e error sem expor payload/payloadHash.
 */
export async function lookupGatesForUser(userId: string, gateIds: string[]): Promise<Map<string, WriteGateMinimalRow>> {
  const map = new Map<string, WriteGateMinimalRow>();
  if (gateIds.length === 0) return map;

  const sliceIds = gateIds.slice(0, 100);
  const db = getDb();
  const rows = await db
    .select({
      id: writeGates.id,
      status: writeGates.status,
      expiresAt: writeGates.expiresAt,
      result: writeGates.result,
      error: writeGates.error,
    })
    .from(writeGates)
    .where(and(inArray(writeGates.id, sliceIds), eq(writeGates.userId, userId)));

  for (const r of rows) {
    map.set(r.id, r);
  }

  return map;
}

/**
 * Reconstrução de status de mensagens utilizando o resultado da busca de gates.
 */
export function reconstructMessagesGateStatus<T extends { role: string; metadata?: unknown }>(
  messages: T[],
  gateMap: Map<string, WriteGateMinimalRow>
): T[] {
  if (gateMap.size === 0) return messages;

  return messages.map((msg) => {
    if (msg.role !== "assistant" || !msg.metadata || typeof msg.metadata !== "object") {
      return msg;
    }
    const meta = msg.metadata as Record<string, unknown>;
    let steps = Array.isArray(meta.steps) ? [...meta.steps] : undefined;
    const trace = meta.trace && typeof meta.trace === "object" ? { ...(meta.trace as Record<string, unknown>) } : undefined;

    let changed = false;

    if (steps) {
      steps = steps.map((step) => {
        if (typeof step === "object" && step !== null && (step as Record<string, unknown>).type === "tool_call") {
          const toolCall = { ...((step as Record<string, unknown>).toolCall as Record<string, unknown>) };
          const outText = String(toolCall.summaryOutput || toolCall.fullOutput || "");
          const gateId = extractGateId(outText) || (typeof toolCall.gateId === "string" ? toolCall.gateId : null);

          if (gateId && gateMap.has(gateId)) {
            const g = gateMap.get(gateId)!;
            const mapped = mapGateStatusToUi(g);
            if (mapped.status !== toolCall.status) {
              toolCall.status = mapped.status;
              if (mapped.summaryOutput) {
                toolCall.summaryOutput = mapped.summaryOutput;
              }
              toolCall.gateId = gateId;
              changed = true;
              return { ...(step as Record<string, unknown>), toolCall };
            }
          }
        }
        return step;
      });
    }

    if (trace && Array.isArray(trace.toolCalls)) {
      const toolCalls = (trace.toolCalls as Array<Record<string, unknown>>).map((tc) => {
        const outText = String(tc.summaryOutput || tc.fullOutput || "");
        const gateId = extractGateId(outText) || (typeof tc.gateId === "string" ? tc.gateId : null);

        if (gateId && gateMap.has(gateId)) {
          const g = gateMap.get(gateId)!;
          const mapped = mapGateStatusToUi(g);
          if (mapped.status !== tc.status) {
            changed = true;
            return { ...tc, status: mapped.status, gateId };
          }
        }
        return tc;
      });
      trace.toolCalls = toolCalls;
    }

    if (changed) {
      return {
        ...msg,
        metadata: {
          ...meta,
          ...(steps ? { steps } : {}),
          ...(trace ? { trace } : {}),
        },
      };
    }
    return msg;
  });
}
