/**
 * Conversation event stream (migration 0017).
 * Append-only: estado muda só com evento novo; scrub no write.
 */
import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { conversations } from "./schema";

export const eventArtifacts = pgTable(
  "event_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    charCount: integer("char_count").notNull(),
    contentType: text("content_type").notNull().default("text/plain"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("event_artifacts_conversation_id_idx").on(t.conversationId)]
);

export const conversationEvents = pgTable(
  "conversation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    seq: bigint("seq", { mode: "number" }).notNull(),
    type: text("type").notNull(),
    source: text("source").notNull().default("runtime"),
    payload: jsonb("payload").notNull().default({}),
    preview: text("preview").notNull().default(""),
    artifactId: uuid("artifact_id").references(() => eventArtifacts.id, {
      onDelete: "set null",
    }),
    visibility: text("visibility").notNull().default("llm"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conversation_events_conversation_id_seq_uidx").on(t.conversationId, t.seq),
    index("conversation_events_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("conversation_events_conversation_seq_idx").on(t.conversationId, t.seq),
  ]
);

export type ConversationEventRow = typeof conversationEvents.$inferSelect;
export type EventArtifactRow = typeof eventArtifacts.$inferSelect;
