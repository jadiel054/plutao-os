/**
 * Teste de integração (RUN_PG_TESTS=1): eventos de missão emitidos por
 * emitMissionEvent aparecem no stream (tabela conversation_events) da conversa
 * vinculada, com seq monotônico e scrub. Sem conversa, nada é gravado.
 * Mesmo padrão de experience-store.pg.integration.test.ts (Drizzle sobre pg).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { drizzle, type NodePgClient } from "drizzle-orm/node-postgres";

const env = vi.hoisted(() => ({ db: null as unknown as object }));
vi.mock("@/lib/db", () => ({ getDb: () => env.db }));

import { emitMissionEvent } from "@/lib/events/missionEventEmitter";
import { listConversationEvents } from "@/lib/events/appendConversationEvent";

const RUN = process.env.RUN_PG_TESTS === "1";
const d = RUN ? describe : describe.skip;

let pool: Pool;

const BOOTSTRAP = [
  "CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL);",
  "CREATE TABLE IF NOT EXISTS conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, user_id uuid REFERENCES users(id) ON DELETE cascade);",
  [
    "CREATE TABLE IF NOT EXISTS event_artifacts (",
    "  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,",
    "  conversation_id uuid NOT NULL,",
    "  content text NOT NULL,",
    "  char_count integer NOT NULL,",
    "  content_type text NOT NULL,",
    "  created_at timestamp with time zone DEFAULT now() NOT NULL",
    ");",
  ].join(" "),
  [
    "CREATE TABLE IF NOT EXISTS conversation_events (",
    "  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,",
    "  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE cascade,",
    "  seq integer NOT NULL,",
    "  type text NOT NULL,",
    "  source text NOT NULL,",
    "  payload jsonb DEFAULT '{}'::jsonb NOT NULL,",
    "  preview text NOT NULL,",
    "  artifact_id uuid,",
    "  visibility text DEFAULT 'llm' NOT NULL,",
    "  created_at timestamp with time zone DEFAULT now() NOT NULL",
    ");",
  ].join(" "),
  "CREATE UNIQUE INDEX IF NOT EXISTS conversation_events_conversation_id_seq_uidx ON conversation_events (conversation_id, seq);",
].join("\n");

const mineIds: string[] = [];

async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try { return await fn(); } catch (err) { last = err; }
  }
  throw last;
}

beforeAll(async () => {
  if (!RUN) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  for (let attempt = 0; attempt < 6; attempt++) {
    try { await pool.query(BOOTSTRAP); break; } catch (err) { if (attempt === 5) throw err; }
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

async function cleanupMine(): Promise<void> {
  try {
    await pool.query("DELETE FROM conversation_events WHERE conversation_id = ANY($1::uuid[])", [mineIds]);
    await pool.query("DELETE FROM event_artifacts WHERE conversation_id = ANY($1::uuid[])", [mineIds]);
    await pool.query("DELETE FROM conversations WHERE id = ANY($1::uuid[])", [mineIds]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [mineIds]);
    mineIds.length = 0;
  } catch { /* corrida de bootstrap */ }
}

async function newUserWithConversation(): Promise<{ userId: string; conversationId: string }> {
  const u = await pool.query("INSERT INTO users (id) VALUES (gen_random_uuid()) RETURNING id::text AS id");
  const userId = u.rows[0].id as string;
  mineIds.push(userId);
  const c = await pool.query("INSERT INTO conversations (user_id) VALUES ($1::uuid) RETURNING id::text AS id", [userId]);
  const conversationId = c.rows[0].id as string;
  mineIds.push(conversationId);
  return { userId, conversationId };
}

d("eventos de missão no stream da conversa", () => {
  it("emite sequência de execução e lê de volta via listConversationEvents", async () => {
    await withRetry(async () => {
      const { conversationId } = await newUserWithConversation();
      const missionId = "99999999-9999-9999-9999-999999999999";
      const s = await emitMissionEvent({ conversationId, missionId, phase: "started", title: "Nó iniciado: Pesquisar", nodeId: "n1" });
      const r = await emitMissionEvent({ conversationId, missionId, phase: "result", title: "Nó verificado: Pesquisar", ok: true, nodeId: "n1" });
      const c = await emitMissionEvent({ conversationId, missionId, phase: "completed", title: "Missão concluída", ok: true });
      expect(s?.seq).toBe(1);
      expect(r?.seq).toBe(2);
      expect(c?.seq).toBe(3);
      const stream = await listConversationEvents({ conversationId, limit: 50 });
      expect(stream.events.map((e) => e.type)).toEqual(["mission_started", "mission_result", "mission_completed"]);
      expect(stream.events.every((e) => e.source === "mission_runtime")).toBe(true);
      expect(String(stream.events[0].preview)).toContain("[" + missionId.slice(0, 8) + "]");
    });
  });

  it("sem conversa vinculada nada é gravado (estado vazio honesto)", async () => {
    await withRetry(async () => {
      const { conversationId } = await newUserWithConversation();
      const before = await listConversationEvents({ conversationId, limit: 50 });
      const out = await emitMissionEvent({ conversationId: null, missionId: "m-1", phase: "started", title: "x" });
      expect(out).toBeNull();
      const after = await listConversationEvents({ conversationId, limit: 50 });
      expect(after.events).toHaveLength(before.events.length);
    });
  });

  it("segredo no título é scrubbed antes de gravar", async () => {
    await withRetry(async () => {
      const { conversationId } = await newUserWithConversation();
      const ev = await emitMissionEvent({
        conversationId,
        missionId: "m-2",
        phase: "failed",
        title: "falhou com token sk-test_ABC123XYZ7890123456789 no log",
        error: "boom",
      });
      expect(ev).not.toBeNull();
      expect(String(ev!.preview)).not.toMatch(/sk-test_ABC123/);
    });
  });
});
