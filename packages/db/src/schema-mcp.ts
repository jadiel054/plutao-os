/**
 * MCP OAuth grants schema (migration 0009).
 * Separated to keep additive changes isolated.
 */
import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

export const mcpOauthGrants = pgTable(
  "mcp_oauth_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    scope: text("scope").notNull().default("mcp:read"),
    refreshTokenHash: text("refresh_token_hash"),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mcp_oauth_grants_user_id_idx").on(t.userId),
    index("mcp_oauth_grants_client_id_idx").on(t.clientId),
  ]
);

export const mcpAuthCodes = pgTable(
  "mcp_auth_codes",
  {
    jti: text("jti").primaryKey(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => mcpOauthGrants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    scope: text("scope").notNull().default("mcp:read"),
    codeChallenge: text("code_challenge").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mcp_auth_codes_grant_id_idx").on(t.grantId),
    index("mcp_auth_codes_expires_at_idx").on(t.expiresAt),
  ]
);
