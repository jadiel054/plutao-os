import { and, eq } from "drizzle-orm";
import { missions, tasks } from "@plutao/db";
import { getDb } from "@/lib/db";

/** Mission owned by user, or null. */
export async function getOwnedMission(missionId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(missions)
    .where(and(eq(missions.id, missionId), eq(missions.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Task + parent mission, only if mission.userId matches. */
export async function getOwnedTask(taskId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      task: tasks,
      missionUserId: missions.userId,
      missionId: missions.id,
      missionEvidence: missions.evidence,
    })
    .from(tasks)
    .innerJoin(missions, eq(tasks.missionId, missions.id))
    .where(and(eq(tasks.id, taskId), eq(missions.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export type EvidenceItem = {
  id: string;
  type: string;
  content: string;
  source: string;
  taskId: string | null;
  missionId: string;
  createdAt: string;
};

export function parseEvidence(raw: unknown): EvidenceItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is EvidenceItem =>
      e != null &&
      typeof e === "object" &&
      typeof (e as EvidenceItem).id === "string" &&
      typeof (e as EvidenceItem).content === "string"
  );
}
