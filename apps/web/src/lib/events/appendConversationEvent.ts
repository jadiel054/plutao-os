/**
 * Append-only conversation events.
 * Seq monotônico por conversa (UNIQUE + retry em conflito).
 * Scrub no write — todas as superfícies herdam.
 */

import { randomUUID } from "node:crypto";
import { desc, eq, gt, and, asc } from "drizzle-orm";
import { conversationEvents, eventArtifacts } from "@plutao/db";
import { getDb } from "@/lib/db";
import { scrubText, scrubValue, buildTruncatedPreview } from "./scrub";
import {
  ARTIFACT_CHAR_THRESHOLD,
  PREVIEW_HEAD,
  PREVIEW_TAIL,
  type AppendConversationEventInput,
  type ConversationEventDTO,
} from "./types";

const MAX_SEQ_RETRIES = 8;

function toDto(row: {
  id: string;
  conversationId: string;
  seq: number;
  type: string;
  source: string;
  payload: unknown;
  preview: string;
  artifactId: string | null;
  visibility: string;
  createdAt: Date | string | null;
}): ConversationEventDTO {
  const created =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : row.createdAt
        ? String(row.createdAt)
        : new Date().toISOString();
  return {
    id: row.id,
    conversationId: row.conversationId,
    seq: Number(row.seq),
    type: row.type,
    source: row.source,
    payload: (row.payload && typeof row.payload === "object"
      ? row.payload
      : {}) as Record<string, unknown>,
    preview: row.preview,
    artifactId: row.artifactId,
    visibility: row.visibility,
    createdAt: created,
  };
}

async function nextSeq(conversationId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ seq: conversationEvents.seq })
    .from(conversationEvents)
    .where(eq(conversationEvents.conversationId, conversationId))
    .orderBy(desc(conversationEvents.seq))
    .limit(1);
  const last = rows[0]?.seq;
  return (typeof last === "number" ? last : Number(last || 0)) + 1;
}

export async function appendConversationEvent(
  input: AppendConversationEventInput
): Promise<ConversationEventDTO | null> {
  const conversationId = input.conversationId?.trim();
  if (!conversationId) return null;

  const fullRaw = input.fullText ?? input.preview ?? "";
  const scrubbedFull = scrubText(fullRaw);
  const payload = scrubValue(input.payload ?? {}) as Record<string, unknown>;

  const needsArtifact =
    input.forceArtifact ||
    scrubbedFull.length > ARTIFACT_CHAR_THRESHOLD ||
    (input.fullText != null && input.fullText.length > ARTIFACT_CHAR_THRESHOLD);

  let preview: string;
  let artifactId: string | null = null;

  if (needsArtifact && scrubbedFull.length > 0) {
    const trunc = buildTruncatedPreview(scrubbedFull, PREVIEW_HEAD, PREVIEW_TAIL);
    preview = trunc.preview;
    const db = getDb();
    const art = await db
      .insert(eventArtifacts)
      .values({
        conversationId,
        content: scrubbedFull,
        charCount: scrubbedFull.length,
        contentType: "text/plain",
      })
      .returning({ id: eventArtifacts.id });
    artifactId = art[0]?.id ?? null;
    payload.charCount = scrubbedFull.length;
    if (artifactId) payload.artifactId = artifactId;
  } else {
    preview = scrubText(input.preview ?? scrubbedFull).slice(0, 4_000);
  }

  const source = (input.source || "runtime").slice(0, 120);
  const visibility = input.visibility === "internal" ? "internal" : "llm";
  const type = input.type;

  for (let attempt = 0; attempt < MAX_SEQ_RETRIES; attempt++) {
    const seq = await nextSeq(conversationId);
    try {
      const db = getDb();
      const inserted = await db
        .insert(conversationEvents)
        .values({
          id: randomUUID(),
          conversationId,
          seq,
          type,
          source,
          payload,
          preview,
          artifactId,
          visibility,
        })
        .returning();
      const row = inserted[0];
      if (!row) return null;
      return toDto(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // unique violation → retry com novo seq
      if (/unique|duplicate|conversation_events_conversation_id_seq/i.test(msg)) {
        continue;
      }
      console.error("[appendConversationEvent]", err);
      return null;
    }
  }
  console.error("[appendConversationEvent] seq retries exhausted", conversationId);
  return null;
}

export async function listConversationEvents(opts: {
  conversationId: string;
  cursor?: number | null;
  limit?: number;
}): Promise<{ events: ConversationEventDTO[]; nextCursor: number | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const db = getDb();
  const cursor = opts.cursor != null && Number.isFinite(opts.cursor) ? Number(opts.cursor) : null;

  const rows =
    cursor != null
      ? await db
          .select()
          .from(conversationEvents)
          .where(
            and(
              eq(conversationEvents.conversationId, opts.conversationId),
              gt(conversationEvents.seq, cursor)
            )
          )
          .orderBy(asc(conversationEvents.seq))
          .limit(limit)
      : await db
          .select()
          .from(conversationEvents)
          .where(eq(conversationEvents.conversationId, opts.conversationId))
          .orderBy(asc(conversationEvents.seq))
          .limit(limit);

  const events = rows.map(toDto);
  const nextCursor = events.length > 0 ? events[events.length - 1]!.seq : cursor;
  return { events, nextCursor: events.length === limit ? nextCursor : null };
}

/** Helpers de domínio — falha silenciosa (chat não deve quebrar por event log). */
export async function emitUserMessage(conversationId: string, text: string) {
  return appendConversationEvent({
    conversationId,
    type: "user_message",
    source: "chat",
    preview: text,
    payload: { role: "user" },
  });
}

export async function emitAssistantMessage(conversationId: string, text: string) {
  return appendConversationEvent({
    conversationId,
    type: "assistant_message",
    source: "chat",
    preview: text,
    fullText: text,
    payload: { role: "assistant" },
  });
}

export async function emitAction(opts: {
  conversationId: string;
  tool: string;
  inputSummary: string;
  thought?: string;
  source?: string;
}) {
  return appendConversationEvent({
    conversationId: opts.conversationId,
    type: "action",
    source: opts.source || "tool_dispatcher",
    preview: `${opts.tool}: ${opts.inputSummary}`.slice(0, 500),
    payload: {
      tool: opts.tool,
      inputSummary: scrubText(opts.inputSummary).slice(0, 500),
      thought: opts.thought ? scrubText(opts.thought).slice(0, 500) : undefined,
    },
  });
}

export async function emitObservation(opts: {
  conversationId: string;
  tool: string;
  ok: boolean;
  outputOrError: string;
  source?: string;
}) {
  return appendConversationEvent({
    conversationId: opts.conversationId,
    type: "observation",
    source: opts.source || "tool_dispatcher",
    preview: opts.outputOrError.slice(0, 500),
    fullText: opts.outputOrError,
    payload: { tool: opts.tool, ok: opts.ok },
  });
}
