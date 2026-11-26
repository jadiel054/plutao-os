/**
 * Testes de integração — registro de experiências operacionais (núcleo agêntico).
 * Rodam apenas quando RUN_PG_TESTS=1. Os arquivos pg compartilham um único
 * PostgreSQL no CI e rodam em paralelo: outros arquivos fazem TRUNCATE CASCADE
 * em "users", apagando linhas deste teste ao acaso. Por isso cada corpo de
 * teste RETENTA algumas vezes antes de falhar de verdade.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  experiencesAvailable,
  findApplicableExperiences,
  listExperiences,
  recordExperience,
} from "@/lib/agentic/experience-store";

const RUN = process.env.RUN_PG_TESTS === "1";
const d = RUN ? describe : describe.skip;

let pool: Pool;

const BOOTSTRAP = [
  "CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL);",
  [
    "CREATE TABLE IF NOT EXISTS agent_experiences (",
    "  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,",
    "  user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,",
    "  subject text NOT NULL,",
    "  kind text NOT NULL,",
    "  method text NOT NULL,",
    "  cause text,",
    "  obstacle_kind text,",
    "  failed_method text,",
    "  alternatives jsonb DEFAULT '[]'::jsonb NOT NULL,",
    "  evidence jsonb DEFAULT '[]'::jsonb NOT NULL,",
    "  limitations jsonb DEFAULT '[]'::jsonb NOT NULL,",
    "  useful_for jsonb DEFAULT '[]'::jsonb NOT NULL,",
    "  requirements jsonb DEFAULT '{}'::jsonb NOT NULL,",
    "  mission_id uuid,",
    "  conversation_id uuid,",
    "  created_at timestamp with time zone DEFAULT now() NOT NULL,",
    "  updated_at timestamp with time zone DEFAULT now() NOT NULL",
    ");",
  ].join(" "),
  "CREATE INDEX IF NOT EXISTS agent_experiences_user_subject_idx ON agent_experiences (user_id, subject);",
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
});

beforeEach(async () => {
  if (!RUN) return;
  // Nunca truncar tabelas compartilhadas; limpeza apenas das próprias linhas.
  await cleanupMine();
});

afterAll(async () => {
  if (!RUN) return;
  await cleanupMine();
  if (pool) await pool.end();
});

const mineIds: string[] = [];

async function newUser(): Promise<string> {
  const res = await pool.query("INSERT INTO users (id) VALUES (gen_random_uuid()) RETURNING id::text AS id");
  const id = res.rows[0].id as string;
  mineIds.push(id);
  return id;
}

/** Deleta somente as linhas deste teste; tolerante a corrida entre arquivos. */
async function cleanupMine(): Promise<void> {
  try {
    await pool.query("DELETE FROM agent_experiences WHERE user_id = ANY($1::uuid[])", [mineIds]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [mineIds]);
    mineIds.length = 0;
  } catch {
    /* tabelas podem não existir ainda (corrida de bootstrap) */
  }
}

d("experience-store — persistência de experiências", () => {
  it("registra e le experiências", async () => {
    await withRetry(async () => {
      expect(await experiencesAvailable()).toBe(true);
      const userId = await newUser();
      const stored = await recordExperience(userId, {
        subject: "github.actions_list",
        kind: "failed_method",
        method: "dispatchTool(github.actions_list)",
        cause: "500 indisponivel",
        obstacleKind: "TOOL_UNAVAILABLE",
        usefulFor: ["recuperacao"],
      });
      expect(stored.stored).toBe(true);
      const list = await listExperiences(userId, "github.actions_list");
      expect(list).toHaveLength(1);
      expect(list[0].kind).toBe("failed_method");
    });
  });

  it("filtra experiencias por compatibilidade", async () => {
    await withRetry(async () => {
      const userId = await newUser();
      await recordExperience(userId, {
        subject: "x.y",
        kind: "succeeded_experience",
        method: "metodo v1",
        requirements: { toolVersion: "v1" },
      });
      const applicable = await findApplicableExperiences(userId, "x.y", { toolVersion: "v1" });
      const incompatible = await findApplicableExperiences(userId, "x.y", { toolVersion: "v9" });
      expect(applicable).toHaveLength(1);
      expect(incompatible).toHaveLength(0);
    });
  });
});
