import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import { getDb } from "@/lib/db";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { sanitizeError, sanitizeText } from "@/lib/security/sanitize";

export const DEFAULT_MODEL_ERROR_HINT =
  "Provedor indisponível ou limite de tokens atingido — verifique a chave MODEL_API_KEY no Vercel.";

export type RecordModelErrorOpts = {
  missionId: string | null | undefined;
  userId: string;
  error: unknown;
  hint?: string;
  taskId?: string | null;
  executionId?: string;
};

export async function recordModelError(
  opts: RecordModelErrorOpts
): Promise<EvidenceItem | null> {
  const {
    missionId,
    userId,
    error,
    hint = DEFAULT_MODEL_ERROR_HINT,
    taskId = null,
    executionId,
  } = opts;

  if (!missionId || !userId) return null;

  try {
    const db = getDb();
    const rows = await db
      .select({ evidence: missions.evidence })
      .from(missions)
      .where(and(eq(missions.id, missionId), eq(missions.userId, userId)))
      .limit(1);

    if (!rows[0]) return null;

    const errDetail = sanitizeError(error, "erro no modelo");
    const content = sanitizeText(
      `MODEL_CALL_FAILED: ${errDetail}${hint ? ` (hint: ${hint})` : ""}`
    ).slice(0, 600);

    const item: EvidenceItem = {
      id: crypto.randomUUID(),
      type: "model_error",
      status: "error",
      content,
      source: "model:plutao-primary",
      taskId,
      missionId,
      ...(executionId ? { executionId } : {}),
      createdAt: new Date().toISOString(),
    };

    const prev = parseEvidence(rows[0].evidence);
    await db
      .update(missions)
      .set({ evidence: [...prev, item], updatedAt: new Date() })
      .where(and(eq(missions.id, missionId), eq(missions.userId, userId)));

    return item;
  } catch (err) {
    console.error("[recordModelError]", err);
    return null;
  }
}
