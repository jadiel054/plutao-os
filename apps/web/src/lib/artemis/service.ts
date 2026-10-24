import { and, desc, eq, inArray } from "drizzle-orm";
import { artemisTasks, type ArtemisExecutor, type ArtemisTaskRow, type ArtemisTaskStatus } from "@plutao/db";
import { getDb } from "@/lib/db";
import { ensureArtemisTasksTable } from "./ensure";
import type { ArtemisProfile, ArtemisTaskPublic } from "./types";

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function toArtemisTaskPublic(row: ArtemisTaskRow): ArtemisTaskPublic {
  return {
    id: row.id,
    userId: row.userId,
    missionId: row.missionId,
    executionId: row.executionId,
    nodeId: row.nodeId,
    executor: row.executor as ArtemisTaskPublic["executor"],
    nonce: row.nonce,
    prompt: row.prompt,
    deviceSerial: row.deviceSerial,
    profile: row.profile as ArtemisProfile,
    status: row.status as ArtemisTaskStatus,
    githubRunId: row.githubRunId,
    githubRunAttempt: row.githubRunAttempt,
    gateId: row.gateId,
    traceUrl: row.traceUrl,
    summary: row.summary,
    error: row.error,
    cancelReason: row.cancelReason,
    cancelledAt: iso(row.cancelledAt),
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
  };
}

export async function getArtemisTask(id: string, userId: string): Promise<ArtemisTaskRow | null> {
  await ensureArtemisTasksTable();
  const rows = await getDb()
    .select()
    .from(artemisTasks)
    .where(and(eq(artemisTasks.id, id), eq(artemisTasks.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getArtemisTaskByNonce(nonce: string, userId?: string): Promise<ArtemisTaskRow | null> {
  await ensureArtemisTasksTable();
  const conditions = userId
    ? and(eq(artemisTasks.nonce, nonce), eq(artemisTasks.userId, userId))
    : eq(artemisTasks.nonce, nonce);
  const rows = await getDb().select().from(artemisTasks).where(conditions).limit(1);
  return rows[0] ?? null;
}

export async function findActiveArtemisTaskForDevice(deviceSerial: string): Promise<ArtemisTaskRow | null> {
  await ensureArtemisTasksTable();
  const rows = await getDb()
    .select()
    .from(artemisTasks)
    .where(and(eq(artemisTasks.deviceSerial, deviceSerial), inArray(artemisTasks.status, ["pending", "running"])))
    .orderBy(desc(artemisTasks.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function createArtemisTask(input: {
  userId: string;
  missionId?: string | null;
  executionId?: string | null;
  nodeId?: string | null;
  nonce: string;
  prompt: string;
  deviceSerial: string;
    profile: ArtemisProfile;
    executor?: ArtemisExecutor;
  gateId?: string | null;
}): Promise<ArtemisTaskRow> {
  await ensureArtemisTasksTable();
  const rows = await getDb()
    .insert(artemisTasks)
    .values({
      userId: input.userId,
      missionId: input.missionId ?? null,
      executionId: input.executionId ?? null,
      nodeId: input.nodeId ?? null,
      executor: input.executor ?? "artemis",
      nonce: input.nonce,
      prompt: input.prompt,
      deviceSerial: input.deviceSerial,
      profile: input.profile,
      status: "pending",
      gateId: input.gateId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("ARTEMIS_TASK_NOT_CREATED");
  return row;
}

export async function updateArtemisTask(
  id: string,
  patch: Partial<{
    githubRunId: string | null;
    githubRunAttempt: number | null;
    status: ArtemisTaskStatus;
    traceUrl: string | null;
    summary: string | null;
    error: string | null;
    cancelReason: string | null;
    cancelledAt: Date | null;
  }>
): Promise<ArtemisTaskRow | null> {
  await ensureArtemisTasksTable();
  const rows = await getDb()
    .update(artemisTasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(artemisTasks.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function transitionArtemisTask(
  id: string,
  from: ArtemisTaskStatus | ArtemisTaskStatus[],
  status: ArtemisTaskStatus,
  patch: Partial<{
    githubRunAttempt: number | null;
    traceUrl: string | null;
    summary: string | null;
    error: string | null;
    cancelReason: string | null;
    cancelledAt: Date | null;
  }> = {}
): Promise<ArtemisTaskRow | null> {
  await ensureArtemisTasksTable();
  const allowed = Array.isArray(from) ? from : [from];
  const rows = await getDb()
    .update(artemisTasks)
    .set({ ...patch, status, updatedAt: new Date() })
    .where(and(eq(artemisTasks.id, id), inArray(artemisTasks.status, allowed)))
    .returning();
  return rows[0] ?? null;
}

export async function listArtemisTasks(opts: {
  userId: string;
  status?: ArtemisTaskStatus | null;
  missionId?: string | null;
  executor?: ArtemisExecutor | null;
  limit?: number;
}): Promise<ArtemisTaskRow[]> {
  await ensureArtemisTasksTable();
  const conditions = [eq(artemisTasks.userId, opts.userId)];
  if (opts.status) conditions.push(eq(artemisTasks.status, opts.status));
  if (opts.missionId) conditions.push(eq(artemisTasks.missionId, opts.missionId));
  if (opts.executor) conditions.push(eq(artemisTasks.executor, opts.executor));
  return getDb()
    .select()
    .from(artemisTasks)
    .where(and(...conditions))
    .orderBy(desc(artemisTasks.createdAt))
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 100));
}

export async function listActiveArtemisTasks(limit = 3): Promise<ArtemisTaskRow[]> {
  await ensureArtemisTasksTable();
  return getDb()
    .select()
    .from(artemisTasks)
    .where(inArray(artemisTasks.status, ["pending", "running"]))
    .orderBy(artemisTasks.updatedAt)
    .limit(Math.min(Math.max(limit, 1), 20));
}
