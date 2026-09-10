/**
 * Database client — Neon serverless (HTTP) + Drizzle.
 *
 * Use DATABASE_URL (pooled) for application queries.
 * Use DATABASE_URL_UNPOOLED only for migrations / long sessions.
 *
 * Never create a module-level Pool in serverless without ending it per request.
 * HTTP `neon()` is preferred for one-shot queries (health, simple reads).
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

/**
 * Creates a Drizzle client bound to the pooled Neon URL.
 * Call per request in serverless environments, or reuse in long-lived Node processes.
 */
export function createDb(connectionString?: string) {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill Neon pooled URL."
    );
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

/**
 * Lightweight connectivity check: SELECT 1 via Neon HTTP.
 * Returns true on success; throws on failure.
 */
export async function checkDatabaseConnection(
  connectionString?: string
): Promise<{ ok: true; latencyMs: number }> {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = neon(url);
  const start = Date.now();
  await sql`SELECT 1 AS ok`;
  return { ok: true, latencyMs: Date.now() - start };
}
