import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { executions, missions, users } from "./schema";
import { writeGates } from "./schema-gates";

export const ARTEMIS_TASK_STATUSES = [
  "pending",
  "running",
  "done",
  "failed",
  "timeout",
  "cancelled",
] as const;

export type ArtemisTaskStatus = (typeof ARTEMIS_TASK_STATUSES)[number];
export const ARTEMIS_EXECUTORS = ["artemis", "maestro", "appium", "playwright", "androidworld"] as const;
export type ArtemisExecutor = (typeof ARTEMIS_EXECUTORS)[number];

/** Durable ARTEMIS dispatch records; the GitHub Actions run is the executor. */
export const artemisTasks = pgTable(
  "artemis_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id").references(() => missions.id, { onDelete: "set null" }),
    executionId: uuid("execution_id").references(() => executions.id, { onDelete: "set null" }),
    nodeId: text("node_id"),
    executor: text("executor").$type<ArtemisExecutor>().notNull().default("artemis"),
    nonce: text("nonce").notNull(),
    prompt: text("prompt").notNull(),
    deviceSerial: text("device_serial").notNull(),
    profile: text("profile").notNull().default("flash"),
    status: text("status").$type<ArtemisTaskStatus>().notNull().default("pending"),
    githubRunId: text("github_run_id"),
    githubRunAttempt: integer("github_run_attempt"),
    gateId: uuid("gate_id").references(() => writeGates.id, { onDelete: "set null" }),
    traceUrl: text("trace_url"),
    summary: text("summary"),
    error: text("error"),
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("artemis_tasks_nonce_uidx").on(t.nonce),
    index("artemis_tasks_user_id_idx").on(t.userId),
    index("artemis_tasks_mission_id_idx").on(t.missionId),
    index("artemis_tasks_execution_id_idx").on(t.executionId),
    index("artemis_tasks_status_idx").on(t.status),
    index("artemis_tasks_device_status_idx").on(t.deviceSerial, t.status),
    index("artemis_tasks_executor_status_idx").on(t.executor, t.status),
    check(
      "artemis_tasks_status_check",
      sql`${t.status} IN ('pending', 'running', 'done', 'failed', 'timeout', 'cancelled')`
    ),
    check(
      "artemis_tasks_executor_check",
      sql`${t.executor} IN ('artemis', 'maestro', 'appium', 'playwright', 'androidworld')`
    ),
  ]
);

export type ArtemisTaskRow = typeof artemisTasks.$inferSelect;
export type NewArtemisTask = typeof artemisTasks.$inferInsert;
