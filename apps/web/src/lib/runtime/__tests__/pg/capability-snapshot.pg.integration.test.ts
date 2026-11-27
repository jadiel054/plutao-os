/**
 * Testes de integração — snapshots do inventário de capacidades (migration 0033).
 * Rodam apenas quando RUN_PG_TESTS=1. Injetamos Drizzle sobre node-postgres
 * via mock de @/lib/db (mesmo padrão dos demais testes pg).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { drizzle, type NodePgClient } from "drizzle-orm/node-postgres";

const env = vi.hoisted(() => ({ db: null as unknown as object }));
vi.mock("@/lib/db", () => ({ getDb: () => env.db }));

import {
  buildCurrentInventory,
  lastSnapshot,
  saveSnapshot,
  snapshotsAvailable,
} from "@/lib/agentic/capability-snapshot";

const RUN = process.env.RUN_PG_TESTS === "1";
const d = RUN ? describe : describe.skip;

let pool: Pool;

const BOOTSTRAP = [
  "CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL);",
  [
    "CREATE TABLE IF NOT EXISTS agentic_capability_snapshots (",
    "  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,",
    "  user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,",
    "  inventory jsonb NOT NULL,",
    "  diff_summary jsonb DEFAULT '{}'::jsonb NOT NULL,",
    "  created_at timestamp with time zone DEFAULT now() NOT NULL",
    ");",
  ].join(" "),
  "CREATE INDEX IF NOT EXISTS agentic_capability_snapshots_user_created_idx ON agentic_capability_snapshots (user_id, created_at);",
].join("\n");

/** Corpo de teste tolerante ao TRUNCATE CASCADE paralelo dos outros arquivos. */
async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

const mineIds: string[] = [];

beforeAll(async () => {
  if (!RUN) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // CREATE TABLE concorrente pode falhar com 23505 (pg_type): retenta.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await pool.query(BOOTSTRAP);
      break;
    } catch (err) {
      if (attempt === 5) throw err;
    }
  }
  env.db = drizzle(pool as unknown as NodePgClient) as unknown as object;
});

beforeEach(async () => {
  if (!RUN) return;
  await cleanupMine();
});

afterAll(async () => {
  if (!RUN) return;
  await cleanupMine();
  if (pool) await pool.end();
});

async function newUser(): Promise<string> {
  const res = await pool.query("INSERT INTO users (id) VALUES (gen_random_uuid()) RETURNING id::text AS id");
  const id = res.rows[0].id as string;
  mineIds.push(id);
  return id;
}

/** Deleta somente as linhas deste teste; tolerante a corrida entre arquivos. */
async function cleanupMine(): Promise<void> {
  try {
    await pool.query("DELETE FROM agentic_capability_snapshots WHERE user_id = ANY($1::uuid[])", [mineIds]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [mineIds]);
    mineIds.length = 0;
  } catch {
    /* tabelas podem não existir ainda (corrida de bootstrap) */
  }
}

d("capability-snapshot — persistência de snapshots", () => {
  it("ciclo save/last com degradação graciosa", async () => {
    await withRetry(async () => {
      expect(await snapshotsAvailable()).toBe(true);
      expect(await lastSnapshot("00000000-0000-0000-0000-000000000000")).toBeNull();
      const userId = await newUser();
      const inventory = {
        generatedAt: new Date().toISOString(),
        capabilities: [
          {
            id: "github.issues_list",
            source: "registry" as const,
            kind: "api" as const,
            description: "lista issues",
            discoveredAt: new Date().toISOString(),
          },
        ],
        surfaces: [{ pageId: "chat", route: "/chat", purpose: "conversa" }],
      };
      const saved = await saveSnapshot(userId, inventory, { added: 1 });
      expect(saved.stored).toBe(true);
      const last = await lastSnapshot(userId);
      expect(last).not.toBeNull();
      expect(last?.inventory.capabilities[0].id).toBe("github.issues_list");
    });
  });

  it("buildCurrentInventory inclui registro e superfícies", async () => {
    await withRetry(async () => {
      const userId = await newUser();
      const inv = await buildCurrentInventory(userId);
      expect(inv.capabilities.length).toBeGreaterThan(0);
      expect(inv.surfaces.some((s) => s.pageId === "chat")).toBe(true);
    });
  });
});
