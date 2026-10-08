import { sql } from "drizzle-orm";
import { runtimeJobs } from "@plutao/db";
import { getDb } from "@/lib/db";
import { RUNTIME_JOB_LEASE_MS } from "./durableJobs";

export type RuntimeJobHealth = {
  checkedAt: string;
  counts: {
    pending: number;
    running: number;
    waitingApproval: number;
    succeeded: number;
    failed: number;
    cancelled: number;
  };
  expiredRunningLeases: number;
  oldestPendingAt: string | null;
  oldestRunningAt: string | null;
  oldestWaitingApprovalAt: string | null;
};

type RuntimeJobHealthRow = {
  pending: unknown;
  running: unknown;
  waitingApproval: unknown;
  succeeded: unknown;
  failed: unknown;
  cancelled: unknown;
  expiredRunningLeases: unknown;
  oldestPendingAt: unknown;
  oldestRunningAt: unknown;
  oldestWaitingApprovalAt: unknown;
};

function asCount(value: unknown) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

function asIsoOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeRuntimeJobHealth(
  row: RuntimeJobHealthRow | null | undefined,
  checkedAt: Date
): RuntimeJobHealth {
  return {
    checkedAt: checkedAt.toISOString(),
    counts: {
      pending: asCount(row?.pending),
      running: asCount(row?.running),
      waitingApproval: asCount(row?.waitingApproval),
      succeeded: asCount(row?.succeeded),
      failed: asCount(row?.failed),
      cancelled: asCount(row?.cancelled),
    },
    expiredRunningLeases: asCount(row?.expiredRunningLeases),
    oldestPendingAt: asIsoOrNull(row?.oldestPendingAt),
    oldestRunningAt: asIsoOrNull(row?.oldestRunningAt),
    oldestWaitingApprovalAt: asIsoOrNull(row?.oldestWaitingApprovalAt),
  };
}

/**
 * Read-only operational view of the durable queue.
 *
 * The query intentionally returns aggregates only: no user, mission, execution,
 * job ID, payload or error text is exposed by the worker health endpoint.
 */
export async function getRuntimeJobHealth(checkedAt = new Date()): Promise<RuntimeJobHealth> {
  const staleBefore = new Date(checkedAt.getTime() - RUNTIME_JOB_LEASE_MS);
  const [row] = await getDb()
    .select({
      pending: sql<number>`count(*) FILTER (WHERE ${runtimeJobs.status} = 'PENDING')`,
      running: sql<number>`count(*) FILTER (WHERE ${runtimeJobs.status} = 'RUNNING')`,
      waitingApproval: sql<number>`count(*) FILTER (WHERE ${runtimeJobs.status} = 'WAITING_APPROVAL')`,
      succeeded: sql<number>`count(*) FILTER (WHERE ${runtimeJobs.status} = 'SUCCEEDED')`,
      failed: sql<number>`count(*) FILTER (WHERE ${runtimeJobs.status} = 'FAILED')`,
      cancelled: sql<number>`count(*) FILTER (WHERE ${runtimeJobs.status} = 'CANCELLED')`,
      expiredRunningLeases: sql<number>`count(*) FILTER (
        WHERE ${runtimeJobs.status} = 'RUNNING'
          AND ${runtimeJobs.lockedAt} IS NOT NULL
          AND ${runtimeJobs.lockedAt} < ${staleBefore}
      )`,
      oldestPendingAt: sql<Date | null>`min(${runtimeJobs.availableAt}) FILTER (WHERE ${runtimeJobs.status} = 'PENDING')`,
      oldestRunningAt: sql<Date | null>`min(${runtimeJobs.lockedAt}) FILTER (WHERE ${runtimeJobs.status} = 'RUNNING')`,
      oldestWaitingApprovalAt: sql<Date | null>`min(${runtimeJobs.updatedAt}) FILTER (WHERE ${runtimeJobs.status} = 'WAITING_APPROVAL')`,
    })
    .from(runtimeJobs);

  return normalizeRuntimeJobHealth(row as RuntimeJobHealthRow | undefined, checkedAt);
}
