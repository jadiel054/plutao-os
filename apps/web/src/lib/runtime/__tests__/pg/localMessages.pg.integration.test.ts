/**
 * Testes de contrato — POST /api/conversations/[id]/messages (persistência local).
 * Rodam apenas quando RUN_PG_TESTS=1 (job integration no CI com postgres:17).
 * Cobre: autenticação/ownership, 404, payload inválido, persistência do par,
 * retry com mesmo id, corrida de requisições simultâneas, envios consecutivos
 * e erro 500 do banco.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { drizzle, type NodePgClient } from "drizzle-orm/node-postgres";

const RUN = process.env.RUN_PG_TESTS === "1";
const d = RUN ? describe : describe.skip;

const env = vi.hoisted(() => ({
  db: null as unknown as object,
  authUser: null as { id: string } | null,
}));
vi.mock("@/lib/db", () => ({ getDb: () => env.db }));
vi.mock("@/lib/auth/session", () => ({ getAuthOrGuestUser: async () => env.authUser }));

import { POST } from "@/app/api/conversations/[id]/messages/route";
import { NextRequest } from "next/server";

let pool: Pool;

const BOOTSTRAP = [
  'CREATE TABLE IF NOT EXISTS "users" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL);',
  "CREATE TABLE IF NOT EXISTS \"conversations\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, \"user_id\" uuid NOT NULL REFERENCES \"users\"(\"id\") ON DELETE cascade, \"title\" text NOT NULL DEFAULT 'Nova conversa', \"is_pinned\" boolean NOT NULL DEFAULT false, \"project_id\" uuid, \"share_token\" text, \"created_at\" timestamp with time zone DEFAULT now(), \"updated_at\" timestamp with time zone DEFAULT now());",
  "CREATE TABLE IF NOT EXISTS \"messages\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, \"conversation_id\" uuid NOT NULL REFERENCES \"conversations\"(\"id\") ON DELETE cascade, \"role\" text NOT NULL, \"content\" text NOT NULL, \"metadata\" jsonb, \"created_at\" timestamp with time zone DEFAULT now());",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"messages_local_client_msg_uidx\" ON \"messages\" (\"conversation_id\", \"role\", (\"metadata\"->>'clientMessageId')) WHERE \"metadata\"->>'clientMessageId' IS NOT NULL;",
].join("\n");

function postReq(convId: string, body: unknown) {
  return new NextRequest("http://localhost/api/conversations/" + convId + "/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPost(convId: string, body: unknown) {
  const res = await POST(postReq(convId, body), { params: Promise.resolve({ id: convId }) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: json as Record<string, unknown> };
}

async function seedConv() {
  const uid = randomUUID();
  await pool.query('INSERT INTO "users" ("id") VALUES ($1)', [uid]);
  const r = await pool.query(
    'INSERT INTO "conversations" ("user_id") VALUES ($1) RETURNING "id"::text AS id',
    [uid]
  );
  return { convId: r.rows[0].id as string, userId: uid };
}

beforeAll(async () => {
  if (!RUN) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(BOOTSTRAP);
  env.db = drizzle(pool as unknown as NodePgClient) as unknown as object;
});

beforeEach(async () => {
  if (!RUN) return;
  await pool.query('TRUNCATE "messages", "conversations", "users" CASCADE');
  env.authUser = null;
});

afterAll(async () => {
  if (pool) await pool.end();
});

d("POST /api/conversations/[id]/messages — contrato", () => {
  it("401 sem usuário autenticado", async () => {
    const { convId } = await seedConv();
    env.authUser = null;
    const r = await callPost(convId, { assistantText: "x" });
    expect(r.status).toBe(401);
  });

  it("404 para conversa inexistente", async () => {
    env.authUser = { id: randomUUID() };
    const r = await callPost(randomUUID(), { assistantText: "x" });
    expect(r.status).toBe(404);
  });

  it("404 para conversa de OUTRO usuário (ownership)", async () => {
    const { convId } = await seedConv();
    env.authUser = { id: randomUUID() };
    const r = await callPost(convId, { assistantText: "x" });
    expect(r.status).toBe(404);
  });

  it("400 com assistantText vazio", async () => {
    const { convId, userId } = await seedConv();
    env.authUser = { id: userId };
    const r = await callPost(convId, { userText: "oi", assistantText: "  " });
    expect(r.status).toBe(400);
  });

  it("persiste o par user+assistant com metadata correta", async () => {
    const { convId, userId } = await seedConv();
    env.authUser = { id: userId };
    const r = await callPost(convId, { userText: "pergunta", assistantText: "resposta", clientMessageId: "cid-1", model: "llama" });
    expect(r.status).toBe(200);
    expect(r.json.persisted).toBe(true);
    const rows = await pool.query('SELECT role, metadata FROM "messages" WHERE "conversation_id" = $1 ORDER BY "created_at"', [convId]);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0].role).toBe("user");
    expect(rows.rows[0].metadata.clientMessageId).toBe("cid-1");
    expect(rows.rows[1].role).toBe("assistant");
  });

  it("retry com o MESMO clientMessageId não duplica (duplicate=true)", async () => {
    const { convId, userId } = await seedConv();
    env.authUser = { id: userId };
    const body = { userText: "pergunta", assistantText: "resposta", clientMessageId: "cid-retry" };
    await callPost(convId, body);
    const r2 = await callPost(convId, body);
    expect(r2.json.duplicate).toBe(true);
    expect(r2.json.persisted).toBe(false);
    const c = await pool.query('SELECT count(*)::int AS n FROM "messages" WHERE "conversation_id" = $1', [convId]);
    expect(c.rows[0].n).toBe(2);
  });

  it("DUAS requisições SIMULTÂNEAS com mesmo id geram exatamente um par (corrida atômica)", async () => {
    const { convId, userId } = await seedConv();
    env.authUser = { id: userId };
    const body = { userText: "pergunta", assistantText: "resposta", clientMessageId: "cid-race" };
    const [a, b] = await Promise.all([callPost(convId, body), callPost(convId, body)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const flags = [a.json.persisted, b.json.persisted].sort();
    expect(flags).toEqual([false, true]);
    const c = await pool.query('SELECT count(*)::int AS n FROM "messages" WHERE "conversation_id" = $1', [convId]);
    expect(c.rows[0].n).toBe(2);
  });

  it("mensagens consecutivas (ids distintos) persistem os dois pares", async () => {
    const { convId, userId } = await seedConv();
    env.authUser = { id: userId };
    await callPost(convId, { userText: "a1", assistantText: "r1", clientMessageId: "cid-1" });
    await callPost(convId, { userText: "a2", assistantText: "r2", clientMessageId: "cid-2" });
    const c = await pool.query('SELECT count(*)::int AS n FROM "messages" WHERE "conversation_id" = $1', [convId]);
    expect(c.rows[0].n).toBe(4);
  });

  it("500 quando o banco falha (não trata como sucesso)", async () => {
    const { convId, userId } = await seedConv();
    env.authUser = { id: userId };
    const prev = env.db;
    env.db = null as unknown as object;
    const r = await callPost(convId, { assistantText: "x" });
    env.db = prev;
    expect(r.status).toBe(500);
  });
});

// Commit trivial para re-disparar o CI (job "Build web" falhou de forma intermitente).
