/**
 * Descoberta e atualização das capacidades do próprio sistema.
 *
 * Agnóstico de processo: recebe fontes de capacidades (registro estático,
 * superfícies da aplicação, ferramentas aprendidas, flags de runtime) e
 * produz um inventário coerente + diff. Não acoplado a PR/GitHub/Vercel.
 */

import { getEnabledCapabilities } from "@/lib/capabilities/registry";

export type CapabilitySource = "registry" | "learned" | "surface" | "runtime_flag";

export type SystemCapability = {
  id: string;
  source: CapabilitySource;
  kind: "tool" | "api" | "page" | "mode" | "integration";
  description: string;
  permissions?: string[];
  relatedTo?: string[];
  discoveredAt: string;
};

export type AppSurfaceRef = {
  pageId: string;
  route: string;
  purpose: string;
};

export type CapabilityInventory = {
  generatedAt: string;
  capabilities: SystemCapability[];
  surfaces: AppSurfaceRef[];
};

export type InventoryDiff = {
  added: SystemCapability[];
  changed: SystemCapability[];
  removed: SystemCapability[];
};

export type DiscoverySources = {
  /** Ferramentas aprendidas (registro de conhecimento operacional). */
  learned?: SystemCapability[];
  /** Superfícies da aplicação (páginas). */
  surfaces?: AppSurfaceRef[];
  /** Flags/modos de runtime. */
  runtimeFlags?: SystemCapability[];
  now?: string;
};

/**
 * Inventário global compartilhado por chat, voz, planejamento, percepção e
 * execução — todos consultam a MESMA visão.
 */
export function discoverSystemCapabilities(sources: DiscoverySources = {}): CapabilityInventory {
  const now = sources.now ?? new Date().toISOString();
  const capabilities: SystemCapability[] = getEnabledCapabilities().map((e) => ({
    id: e.id,
    source: "registry" as const,
    kind: e.mode === "write" ? ("tool" as const) : ("api" as const),
    description: e.notes ?? ("capacidade de conector: " + e.provider + "." + e.capability),
    permissions: e.requiredControls,
    discoveredAt: now,
  }));
  for (const learned of sources.learned ?? []) capabilities.push(learned);
  for (const flag of sources.runtimeFlags ?? []) capabilities.push(flag);
  return {
    generatedAt: now,
    capabilities,
    surfaces: sources.surfaces ?? [],
  };
}

export function diffInventories(previous: CapabilityInventory, current: CapabilityInventory): InventoryDiff {
  const prev = new Map(previous.capabilities.map((c) => [c.id, c]));
  const cur = new Map(current.capabilities.map((c) => [c.id, c]));
  const added: SystemCapability[] = [];
  const changed: SystemCapability[] = [];
  const removed: SystemCapability[] = [];
  for (const c of cur.values()) {
    const old = prev.get(c.id);
    if (!old) added.push(c);
    else if (old.description !== c.description || JSON.stringify(old.permissions) !== JSON.stringify(c.permissions)) {
      changed.push(c);
    }
  }
  for (const c of prev.values()) {
    if (!cur.has(c.id)) removed.push(c);
  }
  return { added, changed, removed };
}

export type StudyPlan = {
  needsStudy: boolean;
  reason?: string;
  steps: Array<{ kind: "read_docs" | "authorized_probe" | "record_knowledge"; target: string; instruction: string }>;
};

/**
 * Para cada capacidade nova/alterada: estudar (doc → probe autorizado →
 * registro de conhecimento). Nunca assume permissão adicional.
 */
export function planStudy(
  diff: InventoryDiff,
  policy: { allowAuthorizedProbe: boolean }
): StudyPlan {
  const targets = [...diff.added, ...diff.changed];
  if (targets.length === 0) {
    return { needsStudy: false, steps: [] };
  }
  const steps: StudyPlan["steps"] = [];
  for (const t of targets.slice(0, 10)) {
    steps.push({
      kind: "read_docs",
      target: t.id,
      instruction: "Estudar documentação/contratos de " + t.id + " (parâmetros, resultados, erros, auth).",
    });
    if (policy.allowAuthorizedProbe && t.kind !== "page") {
      steps.push({
        kind: "authorized_probe",
        target: t.id,
        instruction: "Probe somente leitura e autorizado para confirmar o contrato de " + t.id + ".",
      });
    }
    steps.push({
      kind: "record_knowledge",
      target: t.id,
      instruction:
        "Registrar conhecimento operacional de " + t.id + " (limitações, permissões, relação com outras capacidades).",
    });
  }
  return { needsStudy: true, reason: targets.length + " capacidade(s) nova(s)/alterada(s)", steps };
}
