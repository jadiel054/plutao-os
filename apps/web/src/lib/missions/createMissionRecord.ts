import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { missionObjectiveToGraphV2 } from "@plutao/domain";
import { getDb } from "@/lib/db";
import { matchesMissionIntake, type MissionIntakeInput } from "./intake";

export class MissionIdempotencyConflictError extends Error {
  constructor() {
    super("IDEMPOTENCY_KEY_REUSED");
    this.name = "MissionIdempotencyConflictError";
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  const visited = new Set<object>();
  let current: unknown = error;
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    const candidate = current as {
      code?: unknown;
      message?: unknown;
      detail?: unknown;
      cause?: unknown;
    };
    if (candidate.code === "23505") return true;
    const message = [candidate.message, candidate.detail]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
    if (/duplicate key|unique constraint/i.test(message)) return true;
    current = candidate.cause;
  }
  return typeof error === "string" && /duplicate key|unique constraint/i.test(error);
}

export async function createMissionRecord(userId: string, input: MissionIntakeInput) {
  const db = getDb();
  const missionGraph = missionObjectiveToGraphV2(input.objective);
  const initialDecisions = input.idempotencyKey
    ? [
        {
          type: "idempotency",
          intentId: input.idempotencyKey,
          idempotencyKey: input.idempotencyKey,
          createdAt: new Date().toISOString(),
        },
      ]
    : [];

  try {
    const inserted = await db
      .insert(missions)
      .values({
        userId,
        objective: input.objective,
        context: input.context,
        constraints: input.constraints,
        definitionOfDone: input.definitionOfDone,
        creationSource: input.creationSource,
        conversationId: input.conversationId,
        graphVersion: missionGraph.version,
        missionGraph,
        status: "CREATED",
        currentState: "CREATED",
        completedSteps: [],
        pendingSteps: [],
        evidence: [],
        errors: [],
        decisions: initialDecisions,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({
        id: missions.id,
        objective: missions.objective,
        status: missions.status,
        currentState: missions.currentState,
        definitionOfDone: missions.definitionOfDone,
        creationSource: missions.creationSource,
        conversationId: missions.conversationId,
        graphVersion: missions.graphVersion,
        createdAt: missions.createdAt,
        updatedAt: missions.updatedAt,
      });

    return { mission: inserted[0], deduplicated: false };
  } catch (insertError: unknown) {
    if (!input.idempotencyKey || !isUniqueConstraintViolation(insertError)) throw insertError;

    const existingRows = await db
      .select({
        id: missions.id,
        objective: missions.objective,
        status: missions.status,
        currentState: missions.currentState,
        definitionOfDone: missions.definitionOfDone,
        creationSource: missions.creationSource,
        conversationId: missions.conversationId,
        context: missions.context,
        constraints: missions.constraints,
        createdAt: missions.createdAt,
        updatedAt: missions.updatedAt,
      })
      .from(missions)
      .where(and(eq(missions.userId, userId), eq(missions.idempotencyKey, input.idempotencyKey)))
      .limit(1);

    const existing = existingRows[0];
    if (!existing) throw insertError;
    if (!matchesMissionIntake(existing, input)) throw new MissionIdempotencyConflictError();
    return { mission: existing, deduplicated: true };
  }
}
