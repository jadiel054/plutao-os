/**
 * Emissor de eventos de execução de missão para o stream da conversa vinculada.
 *
 * Reusa appendConversationEvent (mesma tabela conversation_events, scrub no
 * write, seq monotônico, replay/dedupe) — NÃO cria um sistema paralelo.
 * Sem conversa vinculada: retorna null (estado vazio honesto; telemetria e
 * evidências da missão seguem inalteradas). Nunca lança: eventos não podem
 * quebrar a execução.
 */

import { appendConversationEvent, type ConversationEventDTO } from "./appendConversationEvent";

export type MissionEventPhase = "started" | "result" | "failed" | "completed" | "linked";

const PHASE_TO_TYPE: Record<MissionEventPhase, string> = {
  started: "mission_started",
  result: "mission_result",
  failed: "mission_failed",
  completed: "mission_completed",
  linked: "mission_linked",
};

export async function emitMissionEvent(opts: {
  conversationId: string | null | undefined;
  missionId: string;
  phase: MissionEventPhase;
  title: string;
  detail?: string;
  nodeId?: string;
  executionId?: string;
  ok?: boolean;
  error?: string;
}): Promise<ConversationEventDTO | null> {
  const conversationId = opts.conversationId?.trim();
  if (!conversationId) return null;
  const preview =
    "[" + opts.missionId.slice(0, 8) + "] " + opts.title + (opts.detail ? " — " + opts.detail : "");
  return appendConversationEvent({
    conversationId,
    type: PHASE_TO_TYPE[opts.phase],
    source: "mission_runtime",
    preview: preview.slice(0, 500),
    payload: {
      missionId: opts.missionId,
      nodeId: opts.nodeId,
      executionId: opts.executionId,
      ok: opts.ok,
      error: opts.error ? String(opts.error).slice(0, 500) : undefined,
    },
  });
}
