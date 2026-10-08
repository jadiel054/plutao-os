/** Tipos do stream de eventos de conversa (G1). */

export const CONVERSATION_EVENT_TYPES = [
  "user_message",
  "assistant_message",
  "action",
  "observation",
  "plan",
  "state_update",
] as const;

export type ConversationEventType = (typeof CONVERSATION_EVENT_TYPES)[number];

export type EventVisibility = "llm" | "internal";

export type AppendConversationEventInput = {
  conversationId: string;
  type: ConversationEventType;
  source?: string;
  /** Texto bruto (será scrubbed). Payload jsonb também passa por scrub recursivo. */
  preview?: string;
  payload?: Record<string, unknown>;
  /** Se true, força gravar artefato mesmo abaixo do threshold. */
  forceArtifact?: boolean;
  visibility?: EventVisibility;
  /** Conteúdo longo opcional (observation/tool output). */
  fullText?: string;
};

export type ConversationEventDTO = {
  id: string;
  conversationId: string;
  seq: number;
  type: ConversationEventType | string;
  source: string;
  payload: Record<string, unknown>;
  preview: string;
  artifactId: string | null;
  visibility: EventVisibility | string;
  createdAt: string;
};

/** Limite de apresentação: acima disso → event_artifacts + head/tail no preview. */
export const ARTIFACT_CHAR_THRESHOLD = 8_192;
export const PREVIEW_HEAD = 400;
export const PREVIEW_TAIL = 200;
