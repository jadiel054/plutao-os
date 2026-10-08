import { and, eq, isNull } from "drizzle-orm";
import { missions } from "@plutao/db";
import {
  missionObjectiveToGraphV2,
  missionPlanV1ToGraphV2,
  parseMissionPlan,
  validateMissionGraphV2,
  type MissionGraphV2,
} from "@plutao/domain";
import { getDb } from "@/lib/db";
import { getOwnedMission } from "./ownership";

export class MissionGraphPersistenceError extends Error {
  constructor(
    readonly code:
      | "MISSION_NOT_FOUND"
      | "MISSION_GRAPH_VERSION_MISMATCH"
      | "MISSION_GRAPH_INVALID"
      | "MISSION_GRAPH_PERSIST_FAILED"
      | "MISSION_GRAPH_BACKFILL_REQUIRES_REVIEW",
    message = code
  ) {
    super(message);
    this.name = "MissionGraphPersistenceError";
  }
}

function validatePersistedGraph(graph: unknown, version: number | null): MissionGraphV2 {
  if (version !== 2) {
    throw new MissionGraphPersistenceError("MISSION_GRAPH_VERSION_MISMATCH");
  }
  const validated = validateMissionGraphV2(graph);
  if (!validated.ok) {
    throw new MissionGraphPersistenceError("MISSION_GRAPH_INVALID");
  }
  return validated.graph;
}

/**
 * Loads the immutable mission graph or atomically backfills a V1/simple mission.
 * The worker calls this before scheduling; graph definition is never execution state.
 */
export async function ensurePersistedMissionGraph(
  missionId: string,
  userId: string
): Promise<MissionGraphV2> {
  const mission = await getOwnedMission(missionId, userId);
  if (!mission) throw new MissionGraphPersistenceError("MISSION_NOT_FOUND");

  if (mission.missionGraph !== null && mission.missionGraph !== undefined) {
    return validatePersistedGraph(mission.missionGraph, mission.graphVersion);
  }
  if (mission.graphVersion !== null && mission.graphVersion !== undefined) {
    throw new MissionGraphPersistenceError("MISSION_GRAPH_VERSION_MISMATCH");
  }

  const legacyPlan = parseMissionPlan(mission.plan);
  if (legacyPlan?.steps.some((step) => step.status !== "PENDING")) {
    throw new MissionGraphPersistenceError("MISSION_GRAPH_BACKFILL_REQUIRES_REVIEW");
  }
  const candidate = legacyPlan
    ? missionPlanV1ToGraphV2(legacyPlan)
    : missionObjectiveToGraphV2(String(mission.objective ?? ""));
  const graph = validatePersistedGraph(candidate, 2);

  const db = getDb();
  const updated = await db
    .update(missions)
    .set({ graphVersion: 2, missionGraph: graph, updatedAt: new Date() })
    .where(
      and(
        eq(missions.id, missionId),
        eq(missions.userId, userId),
        isNull(missions.missionGraph),
        isNull(missions.graphVersion)
      )
    )
    .returning({ missionGraph: missions.missionGraph, graphVersion: missions.graphVersion });

  if (updated[0]) {
    return validatePersistedGraph(updated[0].missionGraph, updated[0].graphVersion);
  }

  // Another worker may have backfilled the same legacy mission first.
  const reread = await getOwnedMission(missionId, userId);
  if (!reread) throw new MissionGraphPersistenceError("MISSION_NOT_FOUND");
  if (reread.missionGraph === null || reread.missionGraph === undefined) {
    throw new MissionGraphPersistenceError("MISSION_GRAPH_PERSIST_FAILED");
  }
  return validatePersistedGraph(reread.missionGraph, reread.graphVersion);
}
