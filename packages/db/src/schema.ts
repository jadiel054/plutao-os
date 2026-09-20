/**
 * @plutao/db — Drizzle schema
 *
 * Neon — DATABASE_URL (pooled) / DATABASE_URL_UNPOOLED (migrations)
 * Additive: 0001_executions, 0002_missions_idempotency_key, 0003_artifacts, 0004_connectors.
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  plan: text("plan").notNull().default("free"),
  preferredModel: text("preferred_model"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // 'YYYY-MM-DD'
    messages: integer("messages").notNull().default(0),
    premiumMessages: integer("premium_messages").notNull().default(0),
  },
  (t) => [
    uniqueIndex("usage_counters_user_day_uidx").on(t.userId, t.day),
    index("usage_counters_user_id_idx").on(t.userId),
  ]
);

export const founderWaitlist = pgTable("founder_waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)]
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  identity: text("identity"),
  personality: text("personality"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const missions = pgTable(
  "missions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    objective: text("objective").notNull(),
    context: text("context"),
    constraints: text("constraints"),
    plan: jsonb("plan"),
    definitionOfDone: text("definition_of_done"),
    currentState: text("current_state").notNull().default("CREATED"),
    completedSteps: jsonb("completed_steps").notNull().default([]),
    pendingSteps: jsonb("pending_steps").notNull().default([]),
    evidence: jsonb("evidence").notNull().default([]),
    errors: jsonb("errors").notNull().default([]),
    decisions: jsonb("decisions").notNull().default([]),
    idempotencyKey: text("idempotency_key"),
    status: text("status").notNull().default("CREATED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("missions_user_id_idx").on(t.userId),
    index("missions_status_idx").on(t.status),
    uniqueIndex("missions_user_idempotency_uidx").on(t.userId, t.idempotencyKey),
  ]
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    parentTaskId: uuid("parent_task_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("CREATED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_mission_id_idx").on(t.missionId),
    index("tasks_status_idx").on(t.status),
  ]
);

export const executions = pgTable(
  "executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    currentTaskId: uuid("current_task_id"),
    status: text("status").notNull().default("PENDING"),
    checkpoint: jsonb("checkpoint").notNull().default({}),
    checkpointAt: timestamp("checkpoint_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("executions_mission_id_idx").on(t.missionId),
    index("executions_user_id_idx").on(t.userId),
    index("executions_status_idx").on(t.status),
    uniqueIndex("executions_idempotency_key_uidx").on(t.idempotencyKey),
  ]
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_user_id_idx").on(t.userId), index("audit_events_type_idx").on(t.type)]
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id").references(() => missions.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    type: text("type").notNull().default("text/plain"),
    size: integer("size").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("artifacts_user_id_idx").on(t.userId),
    index("artifacts_mission_id_idx").on(t.missionId),
  ]
);

/** MCP / OAuth connectors — one row per (user, provider). Tokens encrypted at app layer. */
export const connectors = pgTable(
  "connectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("disconnected"),
    serverUrl: text("server_url"),
    accountLogin: text("account_login"),
    accountLabel: text("account_label"),
    scopes: jsonb("scopes").notNull().default([]),
    capabilities: jsonb("capabilities").notNull().default([]),
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    oauthState: text("oauth_state"),
    lastError: text("last_error"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("connectors_user_provider_uidx").on(t.userId, t.provider),
    index("connectors_user_id_idx").on(t.userId),
    index("connectors_status_idx").on(t.status),
  ]
);
