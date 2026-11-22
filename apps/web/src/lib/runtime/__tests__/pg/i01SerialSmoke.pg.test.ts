/**
 * I-01 — Smoke de Runtime Serial com banco REAL e modelo REAL.
 *
 * NUNCA roda por padrão. Gate tripla:
 *   1. RUN_I01_SMOKE=1
 *   2. SMOKE_DATABASE_URL apontando para um banco EFÊMERO (branch Neon criada
 *      para o smoke COM AS MIGRATIONS APLICADAS — ver
 *      docs/testes/I-01-smoke/PROCEDIMENTO.md)
 *   3. Provedor de modelo configurado (ex.: GROQ_API_KEY / OPENAI_API_KEY)
 *
 * Proteção anti-produção: se `DATABASE_URL` estiver definido e for igual a
 * `SMOKE_DATABASE_URL`, o teste falha imediatamente antes de qualquer operação.
 * O banho de limpeza é apenas DELETE dos registros semeados por este smoke
 * (CASCADE) — nenhuma tabela é dropada e nenhum dado alheio é tocado.
 */

import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { drizzle, type NodePgClient } from "drizzle-orm/node-postgres";

const RUN = process.env.RUN_I01_SMOKE === "1" && Boolean(process.env.SMOKE_DATABASE_URL);
const env = vi.hoisted(() => ({ db: null as unknown as object }));
vi.mock("@/lib/db", () => ({ getDb: () => env.db }));
vi.mock("@/lib/runtime/ensure", () => ({ ensureExecutionsTable: async () => {} }));

let pool: Pool;

function guardNonProd() {
  const smoke = process.env.SMOKE_DATABASE_URL;
  const prod = process.env.DATABASE_URL;
  if (RUN && smoke && prod && smoke === prod) {
    throw new Error(
      "SMOKE_DATABASE_URL é igual a DATABASE_URL: recusado. O smoke I-01 só roda contra banco efêmero (branch Neon) — nunca contra produção."
    );
  }
}

let plantedUser: string | null = null;

beforeAll(async () => {
  if (!RUN) return;
  guardNonProd();
  const url = process.env.SMOKE_DATABASE_URL!;
  pool = new Pool({ connectionString: url });
  const probe = await pool.query(
    "SELECT to_regclass('\"executions\"') AS executions, to_regclass('\"runtime_jobs\"') AS jobs, to_regclass('\"missions\"') AS missions"
  );
  const missing = ["executions", "jobs", "missions"].filter((key) => !probe.rows[0][key]);
  if (missing.length > 0) {
    await pool.end();
    throw new Error(
      `Tabelas ausentes no banco do smoke (${missing.join(", ")}). Aplique as migrations na branch efêmera antes: DATABASE_URL_UNPOOLED=<direct-url-da-branch> npm run migrate -w @plutao/db`
    );
  }
  env.db = drizzle(pool as unknown as NodePgClient) as unknown as object;
});

afterAll(async () => {
  if (!RUN || !pool) return;
  // Limpeza apenas dos registros SEMEADOS por este smoke (cascade nos filhos).
  if (plantedUser) {
    await pool.query('DELETE FROM "users" WHERE "id" = $1', [plantedUser]);
  }
  await pool.end();
});

describe.skipIf(!RUN)("I-01 smoke — pipeline serial em banco real com modelo real", () => {
  beforeEach(() => {
    guardNonProd();
  });

  it(
    "missão com dois nós dependentes atinge execution COMPLETED + job SUCCEEDED com evidência",
    { timeout: 480_000 },
    async () => {
      const userId = randomUUID();
      const missionId = randomUUID();
      const executionId = randomUUID();
      const email = `i01-smoke-${userId}@smoke.invalid`;

      plantedUser = userId;

      // ── Preparação: dados descartáveis em banco efêmero ──
      await pool.query(
        'INSERT INTO "users" ("id", "email", "name", "is_guest") VALUES ($1, $2, $3, true)',
        [userId, email, "I-01 Smoke (descartável)"]
      );

      const graph = {
        version: 2,
        nodes: [
          {
            id: "node-1",
            kind: "work",
            title: "Registrar base numerica da prova",
            description: "Registre uma nota com o texto exato: i01-etapa-1",
            definitionOfDone: "i01-etapa-1",
            specialistProfileId: "software_engineer",
            requiredCapabilities: ["tool:note"],
            dependsOn: [],
            retryPolicy: { maxAttempts: 2, timeoutSeconds: 120 },
          },
          {
            id: "node-2",
            kind: "work",
            title: "Confirmar sequencia dependente",
            description:
              "Após o nó 1, registre uma nota com o texto exato: i01-etapa-2 (nó 2 depende do nó 1)",
            definitionOfDone: "i01-etapa-2",
            specialistProfileId: "software_engineer",
            requiredCapabilities: ["tool:note"],
            dependsOn: ["node-1"],
            retryPolicy: { maxAttempts: 2, timeoutSeconds: 120 },
          },
        ],
      };

      await pool.query(
        `INSERT INTO "missions"
           ("id", "user_id", "objective", "definition_of_done", "status", "graph_version", "mission_graph", "plan", "completed_steps", "pending_steps", "errors", "decisions")
         VALUES ($1, $2, $3, $4, 'CREATED', 2, $5, NULL, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)`,
        [missionId, userId, "I-01 smoke: registrar duas notas sequenciais dependendo uma da outra", "duas notas registradas", JSON.stringify(graph)]
      );

      await pool.query(
        `INSERT INTO "executions" ("id", "mission_id", "user_id", "status", "checkpoint", "idempotency_key", "started_at")
         VALUES ($1, $2, $3, 'PENDING', '{}'::jsonb, $4, now())`,
        [executionId, missionId, userId, `i01-smoke:${executionId}`]
      );

      await pool.query(
        `INSERT INTO "runtime_jobs" ("id", "user_id", "mission_id", "execution_id", "kind", "status", "available_at", "attempts")
         VALUES ($1, $2, $3, $4, 'mission_execution', 'PENDING', now() - interval '1 second', 0)`,
        [randomUUID(), userId, missionId, executionId]
      );

      // ── Execução: o MESMO worker do cron, em ciclos de drenagem ──
      const { processUserRuntimeJobs } = await import("@/lib/runtime/processUserJobs");

      const rounds: Array<Record<string, unknown>> = [];
      const startedAt = Date.now();
      let jobStatus: string | null = null;
      let executionStatus: string | null = null;
      let missionStatus: string | null = null;

      for (let round = 1; round <= 30; round += 1) {
        const result = await processUserRuntimeJobs(userId, 8);
        for (const entry of result.processed) {
          rounds.push({ at: new Date().toISOString(), ...entry });
        }

        const jobRow = await pool.query('SELECT status FROM "runtime_jobs" WHERE "execution_id" = $1', [executionId]);
        jobStatus = jobRow.rows[0]?.status ?? null;
        const execRow = await pool.query('SELECT status FROM "executions" WHERE "id" = $1', [executionId]);
        executionStatus = execRow.rows[0]?.status ?? null;
        const missionRow = await pool.query('SELECT status FROM "missions" WHERE "id" = $1', [missionId]);
        missionStatus = missionRow.rows[0]?.status ?? null;

        if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(String(jobStatus)) && rounds.length > 0) break;
        if (executionStatus && ["COMPLETED", "FAILED"].includes(String(executionStatus)) && rounds.length > 0) break;

        await new Promise((resolve) => setTimeout(resolve, 1300));
      }

      // ── Asserções de estado final ──
      expect(jobStatus).toBe("SUCCEEDED");
      expect(executionStatus).toBe("COMPLETED");
      expect(missionStatus).toBe("COMPLETED");

      const evidenceRow = await pool.query('SELECT evidence FROM "missions" WHERE "id" = $1', [missionId]);
      const evidence = (evidenceRow.rows[0]?.evidence ?? []) as Array<Record<string, unknown>>;
      const node1Evidence = evidence.filter((e) => (e.metadata as Record<string, unknown>)?.missionNodeId === "node-1");
      const node2Evidence = evidence.filter((e) => (e.metadata as Record<string, unknown>)?.missionNodeId === "node-2");
      expect(node1Evidence.length).toBeGreaterThan(0);
      expect(node2Evidence.length).toBeGreaterThan(0);

      const checkpointRow = await pool.query('SELECT checkpoint FROM "executions" WHERE "id" = $1', [executionId]);
      const runtime = (checkpointRow.rows[0]?.checkpoint?.missionGraphRuntime ?? {}) as {
        nodes?: Record<string, { status?: string }>;
      };
      expect(runtime.nodes?.["node-1"]?.status).toBe("PASSED");
      expect(runtime.nodes?.["node-2"]?.status).toBe("PASSED");

      // ── Evidências esperadas: relatório persistido ──
      const report = {
        smoke: "I-01",
        env: "database efêmero (branch Neon) + modelo real",
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        jobStatus,
        executionStatus,
        missionStatus,
        workerRounds: rounds,
        evidenceCount: evidence.length,
        node1Evidence: node1Evidence.map(shortEvidence),
        node2Evidence: node2Evidence.map(shortEvidence),
        checkpointNodes: runtime.nodes,
      };
      const outDir = join(process.cwd(), "docs", "testes", "I-01-smoke");
      mkdirSync(outDir, { recursive: true });
      const outFile = join(outDir, `report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      writeFileSync(outFile, JSON.stringify(report, null, 2));
      console.log(`[i01-smoke] relatório gravado em ${outFile}`);
      expect(evidence.length).toBeGreaterThanOrEqual(4);
    }
  );
});

function shortEvidence(item: Record<string, unknown>) {
  return {
    id: item.id,
    type: item.type,
    source: item.source,
    createdAt: item.createdAt,
    content: String(item.content ?? "").slice(0, 200),
  };
}


