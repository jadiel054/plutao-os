/** G3: eventos de trabalho do Computador (não conversa). */
export const WORK_EVENT_TYPES = [
  "action",
  "observation",
  "plan",
  "state_update",
] as const;

export type WorkEventType = (typeof WORK_EVENT_TYPES)[number];

export function isWorkEventType(type: string): boolean {
  return (WORK_EVENT_TYPES as readonly string[]).includes(type);
}

export function filterWorkEvents<T extends { type: string }>(events: T[]): T[] {
  return events.filter((e) => isWorkEventType(e.type));
}

/**
 * Dedupe por seq (idempotência de entrega): SSE com replay via cursor pode
 * re-entregar eventos (reconexão, Last-Event-ID predicates) — a UI deve
 * manter UM registro por seq, em ordem crescente.
 */
export function dedupeBySeq<T extends { seq: number }>(events: T[]): T[] {
  const bySeq = new Map<number, T>();
  for (const e of events ?? []) bySeq.set(e.seq, e);
  return Array.from(bySeq.values()).sort((a, b) => a.seq - b.seq);
}
