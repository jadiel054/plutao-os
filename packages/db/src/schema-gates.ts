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
    contentPreview: text("content_preview"),
    status: text("status").notNull().default("pending"),
    decision: text("decision"),
    result: jsonb("result"),
    error: text("error"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("write_gates_user_id_idx").on(t.userId),
    index("write_gates_mission_id_idx").on(t.missionId),
    index("write_gates_status_idx").on(t.status),
    index("write_gates_user_status_idx").on(t.userId, t.status),
  ]
);

export type WriteGateRow = typeof writeGates.$inferSelect;
