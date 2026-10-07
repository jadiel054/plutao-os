/**
 * Server-side mission status transitions (shared by PATCH and autonomous-run).
 */
import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import {
  canTransition,
  isMissionStatus,
  nextStatuses,
  type MissionStatus,
} from "@/lib/missions/lifecycle";
import { getOwnedMission, parseEvidence } from "@/lib/missions/ownership";
import { verifyDefinitionOfDone } from "@/lib/missions/dod";

export type TransitionResult =
  | {
      ok: true;
      status: MissionStatus;
      allowed: MissionStatus[];
      /** H2 — true quando COMPLETED foi recusado e o estado virou INCONCLUSIVE. */
      capped?: boolean;
      requested?: MissionStatus;
      message?: string;
      dod?: unknown;
    }
  | {
      ok: false;
      error: string;
      message?: string;
      from?: string;
      to?: string;
      allowed?: MissionStatus[];
      dod?: unknown;
    };

/**
 * Apply a single lifecycle transition for an owned mission.
 *
 * H2 — o parâmetro `force` foi REMOVIDO. Ele permitia `force=true` levar a
 * missão a COMPLETED sem nenhuma evidência (bypass do DoD). Agora, quando o
 * DoD não passa, o estado máximo alcançável é `INCONCLUSIVE` — nunca COMPLETED.
 */
export async function transitionMissionStatus(opts: {
  missionId: string;
  userId: string;
  toStatus: string;
}): Promise<TransitionResult> {
  const { missionId, userId } = opts;
  if (!isMissionStatus(opts.toStatus)) {
    return { ok: false, error: "Status inválido", to: opts.toStatus };
  }
  const to = opts.toStatus as MissionStatus;

  const db = getDb();
  const existing = await db
    .select({ id: missions.id, status: missions.status })
    .from(missions)
    .where(and(eq(missions.id, missionId), eq(missions.userId, userId)))
    .limit(1);

  if (!existing[0]) {
    return { ok: false, error: "Missão não encontrada" };
  }

  const from = String(existing[0].status);
  if (!canTransition(from, to)) {
    return {
      ok: false,
      error: "Transição não permitida",
      from,
      to,
      allowed: nextStatuses(from),
    };
  }

  if (to === "COMPLETED") {
    const full = await getOwnedMission(missionId, userId);
    if (!full) {
      return { ok: false, error: "Missão não encontrada" };
    }
    const evidence = parseEvidence(full.evidence);
    const dod = verifyDefinitionOfDone({
      objective: String(full.objective ?? ""),
      definitionOfDone: full.definitionOfDone,
      evidence,
    });
    if (!dod.passed) {
      // H2 — sem evidência o teto é INCONCLUSIVE (nunca COMPLETED).
      if (!canTransition(from, "INCONCLUSIVE")) {
        return {
          ok: false,
          error: "DoD_FAILED",
          message: dod.summary,
          dod,
          allowed: nextStatuses(from),
        };
      }
      await db
        .update(missions)
        .set({
          status: "INCONCLUSIVE",
          currentState: "INCONCLUSIVE",
          updatedAt: new Date(),
        })
        .where(and(eq(missions.id, missionId), eq(missions.userId, userId)));
      return {
        ok: true,
        status: "INCONCLUSIVE",
        allowed: nextStatuses("INCONCLUSIVE"),
        capped: true,
        requested: to,
        message: dod.summary,
        dod,
      };
    }
  }

  await db
    .update(missions)
    .set({
      status: to,
      currentState: to,
      updatedAt: new Date(),
    })
    .where(and(eq(missions.id, missionId), eq(missions.userId, userId)));

  return {
    ok: true,
    status: to,
    allowed: nextStatuses(to),
  };
}
