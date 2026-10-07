import type { MissionPlanV1 } from "./types";

export const MISSION_GRAPH_MAX_NODES = 100;
export const MISSION_GRAPH_MAX_DEPENDENCIES_PER_NODE = 100;
export const MISSION_NODE_MAX_ATTEMPTS = 5;
export const MISSION_NODE_MAX_TIMEOUT_SECONDS = 1_200;

export type MissionGraphNodeKind = "work" | "approval" | "verification";

/**
 * Definição imutável de um nó. Estado, tentativa, lease, checkpoint e saída
 * pertencem ao registro de execução do nó, não a este objeto.
 */
export interface MissionGraphNodeV2 {
  id: string;
  kind: MissionGraphNodeKind;
  title: string;
  description?: string | null;
  definitionOfDone?: string | null;
  /** null delega a escolha ao perfil padrão do runtime. */
  specialistProfileId: string | null;
  requiredCapabilities: string[];
  dependsOn: string[];
  retryPolicy: {
    /** Número total de tentativas, incluindo a inicial. */
    maxAttempts: number;
    timeoutSeconds: number;
  };
}

/**
 * Grafo acíclico versionado. Nós sem dependências podem começar em paralelo
 * quando o scheduler habilitar concorrência; o primeiro runtime pode serializá-los.
 */
export interface MissionGraphV2 {
  version: 2;
  nodes: MissionGraphNodeV2[];
}

export type MissionGraphValidationCode =
  | "INVALID_GRAPH"
  | "UNSUPPORTED_VERSION"
  | "NODE_COUNT_OUT_OF_RANGE"
  | "INVALID_NODE"
  | "DUPLICATE_NODE_ID"
  | "INVALID_DEPENDENCY"
  | "DUPLICATE_DEPENDENCY"
  | "MISSING_DEPENDENCY"
  | "SELF_DEPENDENCY"
  | "CYCLE_DETECTED"
  | "INVALID_RETRY_POLICY";

export interface MissionGraphValidationIssue {
  code: MissionGraphValidationCode;
  message: string;
  nodeId?: string;
}

export type MissionGraphValidationResult =
  | { ok: true; graph: MissionGraphV2 }
  | { ok: false; issues: MissionGraphValidationIssue[] };

const NODE_KINDS = new Set<MissionGraphNodeKind>([
  "work",
  "approval",
  "verification",
]);
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const CAPABILITY_PATTERN = /^[a-zA-Z][a-zA-Z0-9._:-]{0,127}$/;
const PROFILE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxLength &&
    value.every((item) => typeof item === "string")
  );
}

/**
 * Validates shape, references, bounded retry policy, and acyclicity before a
 * graph can be persisted or scheduled. It does not authorize capabilities;
 * runtime resolution must still use the server capability registry.
 */
export function validateMissionGraphV2(value: unknown): MissionGraphValidationResult {
  const issues: MissionGraphValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ code: "INVALID_GRAPH", message: "Grafo deve ser um objeto." }],
    };
  }

  if (value.version !== 2) {
    issues.push({
      code: "UNSUPPORTED_VERSION",
      message: "A versão do grafo deve ser 2.",
    });
  }
  if (!Array.isArray(value.nodes)) {
    issues.push({ code: "INVALID_GRAPH", message: "Grafo deve conter uma lista nodes." });
    return { ok: false, issues };
  }
  if (
    value.nodes.length < 1 ||
    value.nodes.length > MISSION_GRAPH_MAX_NODES
  ) {
    issues.push({
      code: "NODE_COUNT_OUT_OF_RANGE",
      message: `O grafo deve conter de 1 a ${MISSION_GRAPH_MAX_NODES} nós.`,
    });
  }

  const nodes = value.nodes;
  const ids = new Set<string>();
  const validNodeRecords: Array<{ id: string; dependsOn: string[] }> = [];

  for (const rawNode of nodes) {
    if (!isRecord(rawNode)) {
      issues.push({ code: "INVALID_NODE", message: "Cada nó deve ser um objeto." });
      continue;
    }

    const nodeId = typeof rawNode.id === "string" ? rawNode.id : undefined;
    const nodeLabel = nodeId ? `Nó ${nodeId}` : "Nó sem id";
    const validId = Boolean(nodeId && ID_PATTERN.test(nodeId));
    const validTitle =
      typeof rawNode.title === "string" &&
      rawNode.title.trim().length > 0 &&
      rawNode.title.length <= 300;
    const validKind =
      typeof rawNode.kind === "string" &&
      NODE_KINDS.has(rawNode.kind as MissionGraphNodeKind);
    const validDescription =
      rawNode.description === undefined ||
      rawNode.description === null ||
      (typeof rawNode.description === "string" && rawNode.description.length <= 8_000);
    const validDod =
      rawNode.definitionOfDone === undefined ||
      rawNode.definitionOfDone === null ||
      (typeof rawNode.definitionOfDone === "string" &&
        rawNode.definitionOfDone.length <= 4_000);
    const validProfile =
      rawNode.specialistProfileId === null ||
      (typeof rawNode.specialistProfileId === "string" &&
        PROFILE_PATTERN.test(rawNode.specialistProfileId));
    const validCapabilities =
      isStringArray(rawNode.requiredCapabilities, 100) &&
      rawNode.requiredCapabilities.every((item) => CAPABILITY_PATTERN.test(item));
    const validDependencies = isStringArray(
      rawNode.dependsOn,
      MISSION_GRAPH_MAX_DEPENDENCIES_PER_NODE
    );
    const retry = rawNode.retryPolicy;
    const validRetry =
      isRecord(retry) &&
      Number.isInteger(retry.maxAttempts) &&
      Number(retry.maxAttempts) >= 1 &&
      Number(retry.maxAttempts) <= MISSION_NODE_MAX_ATTEMPTS &&
      Number.isInteger(retry.timeoutSeconds) &&
      Number(retry.timeoutSeconds) >= 1 &&
      Number(retry.timeoutSeconds) <= MISSION_NODE_MAX_TIMEOUT_SECONDS;

    if (
      !validId ||
      !validTitle ||
      !validKind ||
      !validDescription ||
      !validDod ||
      !validProfile ||
      !validCapabilities ||
      !validDependencies ||
      !validRetry
    ) {
      issues.push({
        code: validRetry ? "INVALID_NODE" : "INVALID_RETRY_POLICY",
        message: `${nodeLabel} não satisfaz o contrato de missão v2.`,
        ...(nodeId ? { nodeId } : {}),
      });
      continue;
    }

    if (ids.has(nodeId!)) {
      issues.push({
        code: "DUPLICATE_NODE_ID",
        message: `${nodeLabel} repete um id existente.`,
        nodeId,
      });
      continue;
    }
    ids.add(nodeId!);
    validNodeRecords.push({ id: nodeId!, dependsOn: rawNode.dependsOn as string[] });
  }

  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const { id } of validNodeRecords) indegree.set(id, 0);

  for (const node of validNodeRecords) {
    const seenDependencies = new Set<string>();
    for (const dependencyId of node.dependsOn) {
      if (seenDependencies.has(dependencyId)) {
        issues.push({
          code: "DUPLICATE_DEPENDENCY",
          message: `Nó ${node.id} repete a dependência ${dependencyId}.`,
          nodeId: node.id,
        });
        continue;
      }
      seenDependencies.add(dependencyId);
      if (dependencyId === node.id) {
        issues.push({
          code: "SELF_DEPENDENCY",
          message: `Nó ${node.id} não pode depender de si mesmo.`,
          nodeId: node.id,
        });
        continue;
      }
      if (!ids.has(dependencyId)) {
        issues.push({
          code: "MISSING_DEPENDENCY",
          message: `A dependência ${dependencyId} do nó ${node.id} não existe.`,
          nodeId: node.id,
        });
        continue;
      }
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      const list = dependents.get(dependencyId) ?? [];
      list.push(node.id);
      dependents.set(dependencyId, list);
    }
  }

  // Kahn's algorithm: rejects cycles before the scheduler can claim any work.
  const ready = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  let visited = 0;
  while (ready.length > 0) {
    const current = ready.shift()!;
    visited += 1;
    for (const child of dependents.get(current) ?? []) {
      const nextDegree = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, nextDegree);
      if (nextDegree === 0) ready.push(child);
    }
  }
  if (visited !== indegree.size) {
    issues.push({
      code: "CYCLE_DETECTED",
      message: "O grafo contém um ciclo; dependências devem formar um DAG.",
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, graph: value as unknown as MissionGraphV2 };
}

/**
 * Compatibility adapter: preserves each V1 step id and creates the exact
 * sequential dependency chain required by the V1 state machine. The adapter
 * defines structure only; execution state remains in the legacy plan/run data.
 */
export function missionPlanV1ToGraphV2(plan: MissionPlanV1): MissionGraphV2 {
  const orderedSteps = [...plan.steps].sort((a, b) => a.index - b.index);
  const graph: MissionGraphV2 = {
    version: 2,
    nodes: orderedSteps.map((step, index) => ({
      id: step.id,
      kind: "work",
      title: step.title,
      description: step.description ?? null,
      definitionOfDone: step.dod ?? null,
      specialistProfileId: null,
      requiredCapabilities: [],
      dependsOn: index === 0 ? [] : [orderedSteps[index - 1]!.id],
      retryPolicy: {
        // Preserve current retry behavior until node-level retry is implemented.
        maxAttempts: 1,
        timeoutSeconds: 1_200,
      },
    })),
  };
  return graph;
}
