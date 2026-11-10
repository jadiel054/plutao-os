/**
 * A-06 — Testes de integração de concorrência contra PostgreSQL real.
 * Rodam apenas quando RUN_PG_TESTS=1 (job dedicado no CI com serviço postgres:17).
 * Não usam mocks de Drizzle: validam claim SKIP LOCKED, lease, lock token,
 * transições concorrentes, retry, WAITING_APPROVAL e reconciliação.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

/** Envolve um literal em aspas simples para embutir em SQL de forma segura. */
function Q(s: string) {
  return "'" + s + "'";
}

const env = vi.hoisted(() => ({ db: null as unknown as object }));

vi.mock("@/lib/db", () => ({ getDb: () => env.db }));
vi.mock("@/lib/runtime/ensure", () => ({ ensureExecutionsTable: async () => {} }));

import {
  claimNextRuntimeJob,
  completeRuntimeJob,
  continueRuntimeJob,
  reconcileRuntimeJobStates,
  releaseResolvedApprovalJobs,
  renewRuntimeJobLease,
  retryRuntimeJob,
  waitRuntimeJobForApproval,
} from "@/lib/runtime/durableJobs";
import {
  completeExecution,
  interruptExecution,
  pauseExecution,
  resumeExecution,
  stopExecution,
  writeCheckpoint,
} from "@/lib/runtime/service";

const RUN = process.env.RUN_PG_TESTS === "1";
const d = RUN ? describe : describe.skip;

let pool: Pool;

const BOOTSTRAP = [
  'CREATE TABLE IF NOT EXISTS "users" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL);',
  'CREATE TABLE IF NOT EXISTS "missions" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade);',
  'CREATE TABLE IF NOT EXISTS "executions" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "mission_id" uuid NOT NULL REFERENCES "missions"("id") ON DELETE cascade, "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade, "current_task_id" uuid, "status" text DEFAULT ' + Q('PENDING') + ' NOT NULL, "checkpoint" jsonb DEFAULT ' + Q('{}::jsonb') + ' NOT NULL, "checkpoint_at" timestamp with time zone, "idempotency_key" text NOT NULL, "error" text, "started_at" timestamp with time zone, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "completed_at" timestamp with time zone, "created_at" timestamp with time zone DEFAULT now() NOT NULL);',
  'CREATE UNIQUE INDEX IF NOT EXISTS "executions_idempotency_key_uidx" ON "executions" ("idempotency_key");',
  'CREATE TABLE IF NOT EXISTS "runtime_jobs" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade, "mission_id" uuid NOT NULL REFERENCES "missions"("id") ON DELETE cascade, "execution_id" uuid NOT NULL REFERENCES "executions"("id") ON DELETE cascade UNIQUE, "kind" text NOT NULL DEFAULT ' + Q('mission_execution') + ', "status" text NOT NULL DEFAULT ' + Q('PENDING') + ', "payload" jsonb NOT NULL DEFAULT ' + Q('{}') + ', "attempts" integer NOT NULL DEFAULT 0, "max_attempts" integer NOT NULL DEFAULT 5, "available_at" timestamp with time zone NOT NULL DEFAULT now(), "locked_at" timestamp with time zone, "lock_token" text, "last_error" text, "created_at" timestamp with time zone NOT NULL DEFAULT now(), "updated_at" timestamp with time zone NOT NULL DEFAULT now(), "completed_at" timestamp with time zone);',
  'CREATE TABLE IF NOT EXISTS "write_gates" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade, "execution_id" uuid NOT NULL, "status" text NOT NULL DEFAULT ' + Q('pending') + ');',
].join("\n");

const SEED_JOB_SQL = [
  'WITH u AS (INSERT INTO "users" ("id") VALUES (gen_random_uuid()) RETURNING "id"),',
  'm AS (INSERT INTO "missions" ("user_id") SELECT "id" FROM u RETURNING "id", "user_id"),',
  'e AS (INSERT INTO "executions" ("mission_id", "user_id", "status", "idempotency_key")',
  'SELECT m."id", m."user_id", ' + Q('RUNNING') + ', ' + Q('seed-') + ' || gen_random_uuid()::text FROM m',
  'RETURNING "id", "mission_id", "user_id")',
  'INSERT INTO "runtime_jobs" ("user_id", "mission_id", "execution_id")',
  'SELECT e."user_id", e."mission_id", e."id" FROM e RETURNING "id", "execution_id", "user_id"',
].join(" ");

async function seedJob(overrides: Record<string, unknown> = {}) {
  const res = await pool.query(SEED_JOB_SQL);
  const row = res.rows[0];
  const keys = Object.keys(overrides);
  if (keys.length > 0) {
    const sets = keys.map((k, i) => '"' + k + '" = $' + (i + 1)).join(", ");
    await pool.query(
      'UPDATE "runtime_jobs" SET ' + sets + ' WHERE "id" = $' + (keys.length + 1),
      [...Object.values(overrides), row.id]
    );
  }
  return row;
}

async function updateExecution(id: string, sets: Record<string, unknown>) {
  const keys = Object.keys(sets);
  const setsSql = keys.map((k, i) => '"' + k + '" = $' + (i + 1)).join(", ");
  await pool.query(
    'UPDATE "executions" SET ' + setsSql + ' WHERE "id" = $' + (keys.length + 1),
    [...Object.values(sets), id]
  );
}

function staleLeaseSql() {
  return 'UPDATE "runtime_jobs" SET "locked_at" = now() - interval ' + Q('9 minutes') + ' WHERE "id" = $1';
}

beforeAll(async () => {
  if (!RUN) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(BOOTSTRAP);
  env.db = drizzle(pool) as unknown as object;
});

beforeEach(async () => {
  if (!RUN) return;
  // Sem limpeza, o claim (ORDER BY available_at, created_at) pode pegar jobs
  // deixados por testes anteriores em vez do job recém-semeado.
  await pool.query('TRUNCATE "write_gates", "runtime_jobs", "executions", "missions", "users" CASCADE');
});

afterAll(async () => {
  if (pool) await pool.end();
});

d("claim SKIP LOCKED", () => {
  it("dois workers concorrentes: exatamente um claim", async () => {
    const seeded = await seedJob();
    const [a, b] = await Promise.all([claimNextRuntimeJob(), claimNextRuntimeJob()]);
    const got = [a, b].filter(Boolean);
    expect(got).toHaveLength(1);
    expect(got[0]!.id).toBe(seeded.id);
    expect(got[0]!.lockToken).toBeTruthy();
    expect(got[0]!.status).toBe("RUNNING");
  });

  it("job RUNNING com lease válido não é reclamado; com lease expirado, é", async () => {
    const seeded = await seedJob();
    const claimed = await claimNextRuntimeJob();
    expect(claimed?.id).toBe(seeded.id);
    expect(await claimNextRuntimeJob()).toBeNull();

    await pool.query(staleLeaseSql(), [seeded.id]);
    const reclaimed = await claimNextRuntimeJob();
    expect(reclaimed?.id).toBe(seeded.id);
    expect(reclaimed?.lockToken).not.toBe(claimed?.lockToken);
    expect(reclaimed?.attempts).toBe(2);
  });
});

d("lease e lock token", () => {
  it("renewRuntimeJobLease renova com token correto e falha com token errado", async () => {
    const seeded = await seedJob();
    const claimed = (await claimNextRuntimeJob())!;
    expect(claimed.id).toBe(seeded.id);

    const before = claimed.lockedAt as Date;
    const renewed = await renewRuntimeJobLease(claimed.id, claimed.lockToken!);
    expect(renewed).not.toBeNull();
    expect((renewed!.lockedAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());

    expect(await renewRuntimeJobLease(claimed.id, "token-invalido")).toBeNull();
  });

  it("worker antigo não consegue completar job reclamado por outro", async () => {
    const seeded = await seedJob();
    const first = (await claimNextRuntimeJob())!;
    await pool.query(staleLeaseSql(), [seeded.id]);
    const second = (await claimNextRuntimeJob())!;

    const stale = await completeRuntimeJob(first.id, first.lockToken!, "SUCCEEDED");
    expect(stale).toBeNull();

    const fresh = await completeRuntimeJob(second.id, second.lockToken!, "SUCCEEDED");
    expect(fresh?.status).toBe("SUCCEEDED");
  });

  it("continueRuntimeJob devolve à fila com attempts decrementado", async () => {
    const seeded = await seedJob();
    const claimed = (await claimNextRuntimeJob())!;
    const cont = await continueRuntimeJob(claimed.id, claimed.lockToken!);
    expect(cont?.status).toBe("PENDING");
    expect(cont?.attempts).toBe(0);
  });
});

d("transições concorrentes de execution", () => {
  it("completeExecution vence interruptExecution; terminal não é revertido", async () => {
    const seeded = await seedJob();
    const [done, interrupted] = await Promise.all([
      completeExecution(seeded.execution_id, seeded.user_id, "COMPLETED"),
      interruptExecution(seeded.execution_id, seeded.user_id),
    ]);
    const final = await pool.query('SELECT "status" FROM "executions" WHERE "id" = $1', [
      seeded.execution_id,
    ]);
    expect(final.rows[0].status).toBe("COMPLETED");
    const oneTerminal =
      done.execution?.status === "COMPLETED" || interrupted.execution?.status === "COMPLETED";
    expect(oneTerminal).toBe(true);
  });

  it("pause em execution RUNNING funciona; resume recupera", async () => {
    const seeded = await seedJob();
    await updateExecution(seeded.execution_id, { status: "RUNNING" });
    const paused = await pauseExecution(seeded.execution_id, seeded.user_id);
    expect(paused.execution?.status).toBe("PAUSED");
    const resumed = await resumeExecution(seeded.execution_id, seeded.user_id);
    expect(resumed.execution?.status).toBe("RUNNING");
  });

  it("stopExecution é idempotente", async () => {
    const seeded = await seedJob();
    const first = await stopExecution(seeded.execution_id, seeded.user_id);
    const second = await stopExecution(seeded.execution_id, seeded.user_id);
    expect(first.execution?.status).toBe("CANCELLED");
    expect(second.alreadyTerminal).toBe(true);
  });

  it("writeCheckpoint persiste payload no checkpoint", async () => {
    const seeded = await seedJob();
    const taskId = randomUUID();
    const first = await writeCheckpoint(seeded.execution_id, seeded.user_id, { taskId });
    expect("execution" in first).toBe(true);
    const row = await pool.query('SELECT "checkpoint" FROM "executions" WHERE "id" = $1', [
      seeded.execution_id,
    ]);
    expect(row.rows[0].checkpoint.taskId).toBe(taskId);
  });
});

d("retry e terminal", () => {
  it("retry até maxAttempts leva a FAILED com completedAt", async () => {
    const seeded = await seedJob({ max_attempts: 2 });
    const claimed = (await claimNextRuntimeJob())!;
    const r1 = await retryRuntimeJob(claimed.id, claimed.lockToken!, "falha transitoria");
    expect(r1?.status).toBe("PENDING");

    // retryRuntimeJob re-agenda com available_at = now + 30s; reabrimos com 1s
    // de folga para o segundo claim imediato (evita corrida de microssegundos
    // entre now() do PostgreSQL e o parâmetro Date do claim).
    await pool.query('UPDATE "runtime_jobs" SET "available_at" = now() - interval ' + Q('1 second') + ' WHERE "id" = $1', [
      claimed.id,
    ]);
    const again = (await claimNextRuntimeJob())!;
    const r2 = await retryRuntimeJob(again.id, again.lockToken!, "falha transitoria");
    expect(r2?.status).toBe("FAILED");
    expect(r2?.completedAt).toBeInstanceOf(Date);
  });
});

d("WAITING_APPROVAL", () => {
  it("sem gate ativo, waitRuntimeJobForApproval não pausa", async () => {
    const seeded = await seedJob();
    const claimed = (await claimNextRuntimeJob())!;
    expect(await waitRuntimeJobForApproval(claimed.id, claimed.lockToken!)).toBeNull();
  });

  it("gate pendente pausa; gate resolvido libera via releaseResolvedApprovalJobs", async () => {
    const seeded = await seedJob();
    await pool.query(
      'INSERT INTO "write_gates" ("user_id", "execution_id", "status") VALUES ($1, $2, ' + Q('pending') + ')',
      [seeded.user_id, seeded.execution_id]
    );
    const claimed = (await claimNextRuntimeJob())!;
    const waiting = await waitRuntimeJobForApproval(claimed.id, claimed.lockToken!);
    expect(waiting?.status).toBe("WAITING_APPROVAL");

    await pool.query('UPDATE "write_gates" SET "status" = ' + Q('executed') + ' WHERE "execution_id" = $1', [
      seeded.execution_id,
    ]);
    const released = await releaseResolvedApprovalJobs(50);
    expect(released).toContain(claimed.id);
  });
});

d("reconciliacao", () => {
  it("corrige job SUCCEEDED com execution não terminal para PENDING", async () => {
    const seeded = await seedJob({ status: "SUCCEEDED", completed_at: new Date() });
    await updateExecution(seeded.execution_id, { status: "RUNNING" });
    const repaired = await reconcileRuntimeJobStates(100);
    const item = repaired.find((r) => r.jobId === seeded.id);
    expect(item?.to).toBe("PENDING");
  });

  it("corrige job FAILED com execution COMPLETED para SUCCEEDED", async () => {
    const seeded = await seedJob({ status: "FAILED", last_error: "STATE_RECONCILED" });
    await updateExecution(seeded.execution_id, { status: "COMPLETED", completed_at: new Date() });
    const repaired = await reconcileRuntimeJobStates(100);
    const item = repaired.find((r) => r.jobId === seeded.id);
    expect(item?.to).toBe("SUCCEEDED");
  });

  it("job SUCCEEDED com execution COMPLETED permanece integro", async () => {
    const seeded = await seedJob({ status: "SUCCEEDED", completed_at: new Date() });
    await updateExecution(seeded.execution_id, { status: "COMPLETED", completed_at: new Date() });
    const repaired = await reconcileRuntimeJobStates(100);
    expect(repaired.find((r) => r.jobId === seeded.id)).toBeUndefined();
  });
});
