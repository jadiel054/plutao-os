/**
 * Testes de integração — atualização de título protegida contra corrida.
 * Rodam apenas quando RUN_PG_TESTS=1 (job dedicado no CI com postgres:17).
 * Valida: aplicação quando o título segue automático; preservação do título
 * manual quando o usuário renomeia durante a geração; isolamento por usuário.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle, type NodePgClient } from "drizzle-orm/node-postgres";
import { applyGeneratedTitle } from "@/lib/chat/guardedTitleUpdate";

const RUN = process.env.RUN_PG_TESTS === "1";
const d = RUN ? describe : describe.skip;

let pool: Pool;

const BOOTSTRAP = [
  'CREATE TABLE IF NOT EXISTS "users" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL);',
  "CREATE TABLE IF NOT EXISTS \"conversations\" (\"id\" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, \"user_id\" uuid NOT NULL REFERENCES \"users\"(\"id\") ON DELETE cascade, \"title\" text NOT NULL DEFAULT 'Nova conversa', \"is_pinned\" boolean NOT NULL DEFAULT false, \"project_id\" uuid, \"share_token\" text, \"created_at\" timestamp with time zone DEFAULT now(), \"updated_at\" timestamp with time zone DEFAULT now());",
].join("\n");

let db: unknown;

beforeAll(async () => {
  if (!RUN) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(BOOTSTRAP);
  db = drizzle(pool as unknown as NodePgClient);
});

beforeEach(async () => {
  if (!RUN) return;
  await pool.query('TRUNCATE "conversations", "users" CASCADE');
});

afterAll(async () => {
  if (pool) await pool.end();
});

async function seedConversation(title: string) {
  const res = await pool.query(
    'WITH u AS (INSERT INTO "users" ("id") VALUES (gen_random_uuid()) RETURNING "id") ' +
      'INSERT INTO "conversations" ("user_id", "title") SELECT u."id", $1 FROM u ' +
      'RETURNING "id", "user_id"::text AS "user_id"',
    [title]
  );
  return res.rows[0] as { id: string; user_id: string };
}

d("applyGeneratedTitle — concorrência de título manual", () => {
  it("aplica quando o título segue no estado automático verificado", async () => {
    const conv = await seedConversation("Nova conversa");
    const result = await applyGeneratedTitle(db, {
      conversationId: conv.id,
      userId: conv.user_id,
      verifiedTitle: "Nova conversa",
      nextTitle: "Planejamento trimestral",
    });
    expect(result.applied).toBe(true);
    const row = await pool.query('SELECT "title" FROM "conversations" WHERE "id" = $1', [conv.id]);
    expect(row.rows[0].title).toBe("Planejamento trimestral");
  });

  it("NÃO sobrescreve quando o usuário renomeou durante a geração", async () => {
    const conv = await seedConversation("Nova conversa");
    // Simula a corrida: entre a verificação e o update final, o usuário renomeia.
    await pool.query('UPDATE "conversations" SET "title" = $1 WHERE "id" = $2', [
      "Meu título manual",
      conv.id,
    ]);
    const result = await applyGeneratedTitle(db, {
      conversationId: conv.id,
      userId: conv.user_id,
      verifiedTitle: "Nova conversa",
      nextTitle: "Planejamento trimestral",
    });
    expect(result.applied).toBe(false);
    const row = await pool.query('SELECT "title" FROM "conversations" WHERE "id" = $1', [conv.id]);
    expect(row.rows[0].title).toBe("Meu título manual");
  });

  it("não aplica quando a conversa é de outro usuário (propriedade)", async () => {
    const conv = await seedConversation("Nova conversa");
    const result = await applyGeneratedTitle(db, {
      conversationId: conv.id,
      userId: randomUUID(),
      verifiedTitle: "Nova conversa",
      nextTitle: "Título intruso",
    });
    expect(result.applied).toBe(false);
    const row = await pool.query('SELECT "title" FROM "conversations" WHERE "id" = $1', [conv.id]);
    expect(row.rows[0].title).toBe("Nova conversa");
  });
});
