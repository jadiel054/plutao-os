/**
 * Bridge: runtime tools → Mission Workspace plan events (View trail).
 * Non-blocking: failures here must not break tool dispatch.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import {
  parseMissionPlan,
  type MissionEvent,
  type MissionPlanV1,
} from "@plutao/domain";
import { getDb } from "@/lib/db";

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

/**
 * Append a tool event to missions.plan when a structured plan exists.
 * If the active step is PENDING and plan is aligned, promote it to RUNNING.
 * On tool failure, mark the RUNNING step as FAILED with cause (gate).
 */
export async function recordToolOnMissionPlan(opts: {
  missionId: string;
  userId: string;
  toolName: string;
  ok: boolean;
  outputOrError: string;
  evidenceId?: string;
}): Promise<void> {
  try {
    const db = getDb();
    const rows = await db
      .select({ plan: missions.plan })
      .from(missions)
      .where(and(eq(missions.id, opts.missionId), eq(missions.userId, opts.userId)))
      .limit(1);

    const plan = parseMissionPlan(rows[0]?.plan);
    if (!plan) return;

    const now = new Date().toISOString();
    const detail = truncate(opts.outputOrError, 240);
    const event: MissionEvent = {
      id: randomUUID(),
      kind: "tool",
      label: opts.ok
        ? `tool:${opts.toolName} ok`
        : `tool:${opts.toolName} falhou`,
      detail: opts.evidenceId
        ? `${detail} · evidence ${opts.evidenceId.slice(0, 8)}`
        : detail,
      stepId: plan.steps[plan.currentStepIndex]?.id ?? null,
      at: now,
    };

    let steps = plan.steps;
    const currentStepIndex = plan.currentStepIndex;

    if (plan.aligned && steps.length > 0) {
      const idx = Math.min(Math.max(0, currentStepIndex), steps.length - 1);
      const active = steps[idx];

      if (active) {
        if (active.status === "PENDING") {
          steps = steps.map((s, i) =>
            i === idx
              ? {
                  ...s,
                  status: "RUNNING" as const,
                  startedAt: now,
                  updatedAt: now,
                }
              : s
          );
        } else if (!opts.ok && active.status === "RUNNING") {
          steps = steps.map((s, i) =>
            i === idx
              ? {
                  ...s,
                  status: "FAILED" as const,
                  failureCause: truncate(
                    `tool:${opts.toolName}: ${opts.outputOrError}`,
                    320
                  ),
                  updatedAt: now,
                }
              : s
          );
        }
      }
    }

    const next: MissionPlanV1 = {
      ...plan,
      steps,
      currentStepIndex,
      events: [...plan.events, event],
      updatedAt: now,
    };

    await db
      .update(missions)
      .set({ plan: next, updatedAt: new Date() })
      .where(and(eq(missions.id, opts.missionId), eq(missions.userId, opts.userId)));
  } catch (e) {
    console.error("[planEvents.recordToolOnMissionPlan]", e);
  }
}
