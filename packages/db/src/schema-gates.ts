/**
 * Write gates schema (migration 0011).
 * Human approval before real-world writes (GitHub create/push, etc.).
 */
import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users, missions } from "./schema";

export const writeGates = pgTable(
  "write_gates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id").references(() => missions.id, {
      onDelete: "set null",
    }),
    executionId: uuid("execution_id"),
    provider: text("provider").notNull(),
    capability: text("capability").notNull(),
    target: text("target").notNull(),
    summary: text("summary").notNull(),
    payload: jsonb("payload").notNull().default({}),
    /**
     * H1 — hash canônico (sha256) do payload aprovado.
     * A execução só acontece se o hash do payload a executar for idêntico.
     */
    payloadHash: text("payload_hash"),
    contentPreview: text("content_preview"),
    status: text("status").notNull().default("pending"),
    decision: text("decision"),
    result: jsonb("result"),
    error: text("error"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** H1 — marca de consumo único, preenchida no claim atômico. */
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    /** Capability que consumiu o gate (rastreabilidade). */
    consumedBy: text("consumed_by"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    /** Gate validity deadline; expired gates can never be consumed. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("write_gates_user_id_idx").on(t.userId),
    index("write_gates_mission_id_idx").on(t.missionId),
    index("write_gates_status_idx").on(t.status),
    index("write_gates_user_status_idx").on(t.userId, t.status),
    index("write_gates_status_consumed_idx").on(t.status, t.consumedAt),
    index("write_gates_status_expires_idx").on(t.status, t.expiresAt),
  ]
);

export type WriteGateRow = typeof writeGates.$inferSelect;
