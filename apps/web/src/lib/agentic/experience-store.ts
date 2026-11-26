/**
 * Registro de experiências operacionais (persistência).
 *
 * Tabela 'agent_experiences' (migration 0032 — preparada, aplicação no Neon
 * é responsabilidade do mantenedor). Enquanto a tabela não existe, o store
 * DEGRADA DE FORMA GRACIOSA (disponível=false) — o núcleo nunca quebra e
 * nunca persiste em segredo.
 *
 * Separação conhecimento × autorização: registrar como usar uma ferramenta
 * NÃO concede permissão para executá-la.
 */

import { and, desc, eq } from "drizzle-orm";
import { agentExperiences } from "@plutao/db";
import { getDb } from "@/lib/db";
import type { KnowledgeKind, OperationalKnowledge } from "./operational-knowledge";

export type ExperienceRecord = OperationalKnowledge & {
  obstacleKind?: string;
  failedMethod?: string;
  cause?: string;
  missionId?: string | null;
  conversationId?: string | null;
};

/** Sonda de existência: nunca cria tabela por conta própria. */
export async function experiencesAvailable(): Promise<boolean> {
  try {
    const db = getDb() as unknown as {
      execute: (sql: unknown) => Promise<{ rows?: Array<{ present?: string | null }> }>;
    };
    await db.select({ probe: agentExperiences.id }).from(agentExperiences).limit(1);
    return true;
  } catch {
    return false;
  }
}

function toRecord(row: Record<string, unknown>): ExperienceRecord {
  return {
    id: String(row.id),
    subject: String(row.subject),
    method: String(row.method),
    kind: String(row.kind) as KnowledgeKind,
    observedAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    requirements: (row.requirements ?? {}) as OperationalKnowledge["requirements"],
    limitations: (row.limitations ?? []) as string[],
    usefulFor: (row.usefulFor ?? []) as string[],
    evidence: (row.evidence ?? []) as string[],
    cause: row.cause != null ? String(row.cause) : undefined,
    obstacleKind: row.obstacleKind != null ? String(row.obstacleKind) : undefined,
    failedMethod: row.failedMethod != null ? String(row.failedMethod) : undefined,
    missionId: row.missionId != null ? String(row.missionId) : null,
    conversationId: row.conversationId != null ? String(row.conversationId) : null,
  };
}

export async function recordExperience(
  userId: string,
  exp: {
    subject: string;
    kind: KnowledgeKind;
    method: string;
    cause?: string;
    obstacleKind?: string;
    failedMethod?: string;
    alternatives?: string[];
    evidence?: string[];
    limitations?: string[];
    usefulFor?: string[];
    requirements?: OperationalKnowledge["requirements"];
    missionId?: string | null;
    conversationId?: string | null;
  }
): Promise<{ stored: boolean; reason?: string }> {
  try {
    if (!(await experiencesAvailable())) {
      return { stored: false, reason: "tabela agent_experiences ausente (migration 0032 pendente)" };
    }
    const db = getDb();
    await db.insert(agentExperiences).values({
      userId,
      subject: exp.subject.slice(0, 160),
      kind: exp.kind,
      method: exp.method.slice(0, 2000),
      cause: exp.cause?.slice(0, 1000) ?? null,
      obstacleKind: exp.obstacleKind ?? null,
      failedMethod: exp.failedMethod ?? null,
      alternatives: exp.alternatives ?? [],
      evidence: exp.evidence ?? [],
      limitations: exp.limitations ?? [],
      usefulFor: exp.usefulFor ?? [],
      requirements: exp.requirements ?? {},
      missionId: exp.missionId ?? null,
      conversationId: exp.conversationId ?? null,
      updatedAt: new Date(),
    });
    return { stored: true };
  } catch (err) {
    console.error("[experience-store] registro de experiência falhou", err instanceof Error ? err.message : String(err));
    return { stored: false, reason: "erro de persistência" };
  }
}

export async function listExperiences(userId: string, subject?: string, limit = 50): Promise<ExperienceRecord[]> {
  try {
    if (!(await experiencesAvailable())) return [];
    const db = getDb();
    const where = subject
      ? and(eq(agentExperiences.userId, userId), eq(agentExperiences.subject, subject))
      : eq(agentExperiences.userId, userId);
    const rows = await db
      .select()
      .from(agentExperiences)
      .where(where)
      .orderBy(desc(agentExperiences.createdAt))
      .limit(limit);
    return (rows as unknown as Array<Record<string, unknown>>).map(toRecord);
  } catch (err) {
    console.error("[experience-store] leitura falhou", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/** Experiências aplicáveis a um assunto (compatíveis com versão/ambiente/permissões). */
export async function findApplicableExperiences(
  userId: string,
  subject: string,
  ctx: { toolVersion?: string; environment?: string; permissions?: string[] } = {}
): Promise<ExperienceRecord[]> {
  const { assessKnowledge } = await import("./operational-knowledge");
  const all = await listExperiences(userId, subject, 100);
  return all.filter((e) => assessKnowledge(e, ctx) === "applicable");
}
