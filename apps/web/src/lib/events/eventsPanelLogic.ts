/**
 * Lógica pura do ConversationEventsPanel (testável sem DOM).
 * mergeEvents: dedupe por id e seq, ordenado por seq, com teto de histórico.
 * nextBackoffMs: backoff exponencial com teto para reconexão SSE.
 */
export type PanelEvent = {
  id: string;
  seq: number;
  type: string;
  source: string;
  preview: string;
  artifactId: string | null;
  createdAt: string;
};

export const MAX_HISTORY = 200;

export function mergeEvents(prev: PanelEvent[], incoming: PanelEvent): PanelEvent[] {
  if (prev.some((e) => e.id === incoming.id || e.seq === incoming.seq)) return prev;
  const next = [...prev, incoming].sort((a, b) => a.seq - b.seq);
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

export function nextBackoffMs(attempt: number): number {
  const clamped = Math.max(0, Math.min(attempt, 4));
  return Math.min(15_000, 1_000 * 2 ** clamped);
}
