/**
 * Descoberta permanente de capacidades — persistência de snapshots.
 *
 * Tabela 'agentic_capability_snapshots' (migration 0033 — preparada,
 * aplicação no Neon é manual pelo mantenedor). Sem a tabela, degrada de
 * forma graciosa (snapshot indisponível; inventário e diff seguem
 * funcionando em memória).
 */

import { and, desc, eq, like } from "drizzle-orm";
import { agentExperiences, agenticCapabilitySnapshots } from "@plutao/db";
import { getDb } from "@/lib/db";
import {
  discoverSystemCapabilities,
  type CapabilityInventory,
  type SystemCapability,
} from "./capability-discovery";
import { APP_SURFACES } from "./app-surface";
import type { ExperienceRecord } from "./experience-store";

/** Experiências de aprendizado de ferramentas viram capacidades aprendidas. */
export function learnedFromExperiences(exps: ExperienceRecord[]): SystemCapability[] {
  return exps
    .filter((e) => e.subject.startsWith("tool-learning:"))
    .map((e) => ({
      id: e.subject,
      source: "learned" as const,
      kind: "tool" as const,
      description: String(e.method ?? "").slice(0, 300),
      permissions: e.requirements?.permissions,
      relatedTo: e.usefulFor?.slice(0, 3),
      discoveredAt: e.observedAt,
    }));
}

/** Inventário atual do sistema (registro estático + aprendidas + superfícies). */
export async function buildCurrentInventory(userId: string): Promise<CapabilityInventory> {
  const { listExperiences } = await import("./experience-store");
  const exps = await listExperiences(userId, undefined, 200);
  return discoverSystemCapabilities({
    learned: learnedFromExperiences(exps),
    surfaces: APP_SURFACES.map((s) => ({ pageId: s.pageId, route: s.route, purpose: s.purpose })),
  });
}

/** Sonda de existência: nunca cria tabela por conta própria. */
export async function snapshotsAvailable(): Promise<boolean> {
  try {
    const db = getDb();
    await db.select({ probe: agenticCapabilitySnapshots.id }).from(agenticCapabilitySnapshots).limit(1);
    return true;
  } catch {
    return false;
  }
}

function toInventory(raw: unknown): CapabilityInventory | null {
  if (!raw || typeof raw !== "object") return null;
  const inv = raw as Partial<CapabilityInventory>;
  if (!Array.isArray(inv.capabilities) || !Array.isArray(inv.surfaces)) return null;
  return inv as CapabilityInventory;
}

/** Último snapshot persistido do usuário (null se nunca houve). */
export async function lastSnapshot(
  userId: string
): Promise<{ inventory: CapabilityInventory; createdAt: string } | null> {
  try {
    if (!(await snapshotsAvailable())) return null;
    const db = getDb();
    const rows = await db
      .select()
      .from(agenticCapabilitySnapshots)
      .where(eq(agenticCapabilitySnapshots.userId, userId))
      .orderBy(desc(agenticCapabilitySnapshots.createdAt))
      .limit(1);
    const row = rows[0] as unknown as Record<string, unknown> | undefined;
    if (!row) return null;
    const inventory = toInventory(row.inventory);
    if (!inventory) return null;
    return {
      inventory,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  } catch (err) {
    console.error("[capability-snapshot] leitura falhou", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function saveSnapshot(
  userId: string,
  inventory: CapabilityInventory,
  diffSummary: Record<string, unknown> = {}
): Promise<{ stored: boolean; reason?: string }> {
  try {
    if (!(await snapshotsAvailable())) {
      return { stored: false, reason: "tabela agentic_capability_snapshots ausente (migration 0033 pendente)" };
    }
    const db = getDb();
    await db.insert(agenticCapabilitySnapshots).values({
      userId,
      inventory,
      diffSummary,
      createdAt: new Date(),
    });
    return { stored: true };
  } catch (err) {
    console.error("[capability-snapshot] gravação falhou", err instanceof Error ? err.message : String(err));
    return { stored: false, reason: "erro de persistência" };
  }
}

/** Conhecimento aprendido (tool-learning:*) do usuário, para API e estudos. */
export async function listLearnedKnowledge(userId: string, limit = 50): Promise<ExperienceRecord[]> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(agentExperiences)
      .where(and(eq(agentExperiences.userId, userId), like(agentExperiences.subject, "tool-learning:%")))
      .orderBy(desc(agentExperiences.createdAt))
      .limit(limit);
    return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      subject: String(row.subject),
      kind: String(row.kind) as ExperienceRecord["kind"],
      method: String(row.method),
      observedAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      requirements: (row.requirements ?? {}) as ExperienceRecord["requirements"],
      limitations: (row.limitations ?? []) as string[],
      usefulFor: (row.usefulFor ?? []) as string[],
      evidence: (row.evidence ?? []) as string[],
    }));
  } catch (err) {
    console.error("[capability-snapshot] listagem de aprendizados falhou", err instanceof Error ? err.message : String(err));
    return [];
  }
}