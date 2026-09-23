/**
 * Write gate service — Princípio 1.
 * Creates pending human-approval requests before real-world writes.
 */

import { and, desc, eq } from "drizzle-orm";
import { createDb, writeGates } from "@plutao/db";

export type CreateGateInput = {
  userId: string;
  missionId?: string | null;
  executionId?: string | null;
  provider: string;
  capability: string;
  target: string;
  summary: string;
  payload: Record<string, unknown>;
  contentPreview?: string | null;
};

export async function createWriteGate(input: CreateGateInput) {
  const db = createDb();
  const [row] = await db
    .insert(writeGates)
    .values({
      userId: input.userId,
      missionId: input.missionId ?? null,
      executionId: input.executionId ?? null,
      provider: input.provider,
      capability: input.capability,
      target: input.target,
      summary: input.summary,
      payload: input.payload,
      contentPreview: input.contentPreview ?? null,
      status: "pending",
    })
    .returning();
  if (!row) throw new Error("failed to create write_gate");
  return row;
}

export async function getWriteGate(gateId: string, userId: string) {
  const db = createDb();
  const [row] = await db
    .select()
    .from(writeGates)
    .where(and(eq(writeGates.id, gateId), eq(writeGates.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listPendingGates(userId: string, missionId?: string | null) {
  const db = createDb();
  const conditions = [eq(writeGates.userId, userId), eq(writeGates.status, "pending")];
  if (missionId) conditions.push(eq(writeGates.missionId, missionId));
  return db
    .select()
    .from(writeGates)
    .where(and(...conditions))
    .orderBy(desc(writeGates.createdAt))
    .limit(20);
}

export async function markGateRejected(gateId: string, userId: string) {
  const db = createDb();
  const [row] = await db
    .update(writeGates)
    .set({
      status: "rejected",
      decision: "rejected",
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(writeGates.id, gateId),
        eq(writeGates.userId, userId),
        eq(writeGates.status, "pending")
      )
    )
    .returning();
  return row ?? null;
}

export async function markGateApproved(
  gateId: string,
  userId: string,
  result?: Record<string, unknown> | null,
  error?: string | null
) {
  const db = createDb();
  const status = error ? "failed" : "executed";
  const [row] = await db
    .update(writeGates)
    .set({
      status,
      decision: "approved",
      decidedAt: new Date(),
      executedAt: error ? null : new Date(),
      result: result ?? null,
      error: error ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(writeGates.id, gateId),
        eq(writeGates.userId, userId),
        eq(writeGates.status, "pending")
      )
    )
    .returning();
  return row ?? null;
}
