/**
 * Testes de integração — registro de experiências operacionais (núcleo agêntico).
 * Rodam apenas quando RUN_PG_TESTS=1 (CI com postgres:17). Sem mocks de
 * Drizzle: gravação, leitura e degradação graciosa quando a tabela falta.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle, type NodePgClient } from "drizzle-orm/node-postgres";
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
  'CREATE TABLE IF NOT EXISTS "users" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL);',
  [
    'CREATE TABLE IF NOT EXISTS "agent_experiences" (',
    '  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,',
    '  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,',
    '  "subject" text NOT NULL,',
    '  "kind" text NOT NULL,',
    '  "method" text NOT NULL,',
    '  "cause" text,',
    '  "obstacle_kind" text,',
    '  "failed_method" text,',
    "  "alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,",
    "  "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,",
    "  "limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,",
    "  "useful_for" jsonb DEFAULT '[]'::jsonb NOT NULL,",
    "  "requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,",
    '  "mission_id" uuid,',
    '  "conversation_id" uuid,',
    '  "created_at" timestamp with time zone DEFAULT now() NOT NULL,',
    '  "updated_at" timestamp with time zone DEFAULT now() NOT NULL',
    ');',
  ].join(" "),
  'CREATE INDEX IF NOT EXISTS "agent_experiences_user_subject_idx" ON "agent_experiences" ("user_id", "subject");',
].join("
");

beforeAll(async () => {
  if (!RUN) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(BOOTSTRAP);
});

beforeEach(async () => {
  if (!RUN) return;
  await pool.query('TRUNCATE "agent_experiences", "users" CASCADE');
});

afterAll(async () => {
  if (pool) await pool.end();
});

d("experience-store — persistência de experiências", () => {
  it("registra e lê experiências", async () => {
    expect(await experiencesAvailable()).toBe(true);
    const res = await pool.query('INSERT INTO "users" ("id") VALUES (gen_random_uuid()) RETURNING "id"::text AS id');
    const userId = res.rows[0].id;
    const stored = await recordExperience(userId, {
      subject: "github.actions_list",
      kind: "failed_method",
      method: "dispatchTool(github.actions_list)",
      cause: "500 indisponível",
      obstacleKind: "TOOL_UNAVAILABLE",
      usefulFor: ["recuperação"],
    });
    expect(stored.stored).toBe(true);
    const list = await listExperiences(userId, "github.actions_list");
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("failed_method");
  });

  it("filtra experiências por compatibilidade", async () => {
    const res = await pool.query('INSERT INTO "users" ("id") VALUES (gen_random_uuid()) RETURNING "id"::text AS id');
    const userId = res.rows[0].id;
    await recordExperience(userId, {
      subject: "x.y",
      kind: "succeeded_experience",
      method: "método v1",
      requirements: { toolVersion: "v1" },
    });
    const applicable = await findApplicableExperiences(userId, "x.y", { toolVersion: "v1" });
    const incompatible = await findApplicableExperiences(userId, "x.y", { toolVersion: "v9" });
    expect(applicable).toHaveLength(1);
    expect(incompatible).toHaveLength(0);
  });
});
