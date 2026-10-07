/** Persistent fixed-window rate-limit buckets for horizontally scaled runtimes. */
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  hits: integer("hits").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
