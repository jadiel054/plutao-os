import { createHash } from "node:crypto";
import type { MissionGraphNodeV2, MissionGraphV2 } from "@plutao/domain";
import { getMissionGraphSerialOrder } from "@plutao/domain";

export type MissionGraphNodeRunStatus = "PENDING" | "RUNNING" | "PASSED" | "FAILED";

export type MissionGraphRuntimeNode = {
  status: MissionGraphNodeRunStatus;
  attempts: number;
  errorCode?: string | null;
};

export type MissionGraphRuntimeV2 = {
  version: 2;
  mode: "serial";
  graphFingerprint: string;
  nodeOrder: string[];
  activeNodeId: string | null;
  nodes: Record<string, MissionGraphRuntimeNode>;
};

export function initializeMissionGraphRuntime(
  graph: MissionGraphV2,
  previous: unknown,
  alreadyPassedNodeIds: string[] = []
): MissionGraphRuntimeV2 | null {
  const order = getMissionGraphSerialOrder(graph);
  if (!order) return null;
  const graphFingerprint = createHash("sha256").update(JSON.stringify(graph)).digest("hex");

  if (previous !== undefined && previous !== null) {
    if (typeof previous !== "object" || Array.isArray(previous)) return null;
    const raw = previous as Partial<MissionGraphRuntimeV2>;
    const sameOrder =
      raw.version === 2 &&
      raw.mode === "serial" &&
      raw.graphFingerprint === graphFingerprint &&
      Array.isArray(raw.nodeOrder) &&
      raw.nodeOrder.length === order.length &&
      raw.nodeOrder.every((id, index) => id === order[index]?.id) &&
      raw.nodes !== null &&
      typeof raw.nodes === "object" &&
      !Array.isArray(raw.nodes);
    if (!sameOrder) return null;

    const nodes: Record<string, MissionGraphRuntimeNode> = {};
    for (const graphNode of order) {
      const state = (raw.nodes as Record<string, unknown>)[graphNode.id];
      if (
        !state ||
        typeof state !== "object" ||
        !["PENDING", "RUNNING", "PASSED", "FAILED"].includes(
          String((state as { status?: unknown }).status)
        ) ||
        !Number.isInteger((state as { attempts?: unknown }).attempts) ||
        Number((state as { attempts?: number }).attempts) < 0
      ) {
        return null;
      }
      const value = state as MissionGraphRuntimeNode;
      nodes[graphNode.id] = {
        status: value.status,
        attempts: value.attempts,
        errorCode: value.errorCode ?? null,
      };
    }
    const activeNodeId =
      typeof raw.activeNodeId === "string" ? raw.activeNodeId : null;
    const activeCount = Object.values(nodes).filter((node) => node.status === "RUNNING").length;
    const dependencyOrderValid = order.every((graphNode) => {
      const status = nodes[graphNode.id]?.status;
      if (status !== "RUNNING" && status !== "PASSED") return true;
      return graphNode.dependsOn.every((dependencyId) => nodes[dependencyId]?.status === "PASSED");
    });
    if (
      activeCount > 1 ||
      !dependencyOrderValid ||
      (activeNodeId !== null && nodes[activeNodeId]?.status !== "RUNNING") ||
      (activeNodeId === null && activeCount !== 0)
    ) {
      return null;
    }
    return {
      version: 2,
      mode: "serial",
      graphFingerprint,
      nodeOrder: order.map((node) => node.id),
      activeNodeId,
      nodes,
    };
  }

  const passed = new Set(alreadyPassedNodeIds);
  const nodes = Object.fromEntries(
    order.map((node) => [
      node.id,
      { status: passed.has(node.id) ? "PASSED" : "PENDING", attempts: 0, errorCode: null },
    ])
  ) as Record<string, MissionGraphRuntimeNode>;
  return {
    version: 2,
    mode: "serial",
    graphFingerprint,
    nodeOrder: order.map((node) => node.id),
    activeNodeId: null,
    nodes,
  };
}

export function nextSerialMissionGraphNode(
  graph: MissionGraphV2,
  runtime: MissionGraphRuntimeV2
): MissionGraphNodeV2 | null {
  if (runtime.activeNodeId) {
    return graph.nodes.find((node) => node.id === runtime.activeNodeId) ?? null;
  }
  if (Object.values(runtime.nodes).some((state) => state.status === "FAILED")) return null;

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const nodeId of runtime.nodeOrder) {
    const node = byId.get(nodeId);
    if (!node || runtime.nodes[nodeId]?.status !== "PENDING") continue;
    if (node.dependsOn.every((dependencyId) => runtime.nodes[dependencyId]?.status === "PASSED")) {
      return node;
    }
  }
  return null;
}

export function startSerialMissionGraphNode(
  graph: MissionGraphV2,
  runtime: MissionGraphRuntimeV2,
  nodeId: string
): MissionGraphRuntimeV2 | null {
  if (runtime.activeNodeId && runtime.activeNodeId !== nodeId) return null;
  const node = graph.nodes.find((item) => item.id === nodeId);
  const state = runtime.nodes[nodeId];
  if (!node || !state || state.status === "PASSED" || state.status === "FAILED") return null;
  if (!node.dependsOn.every((dependencyId) => runtime.nodes[dependencyId]?.status === "PASSED")) {
    return null;
  }
  return {
    ...runtime,
    activeNodeId: nodeId,
    nodes: {
      ...runtime.nodes,
      [nodeId]: {
        ...state,
        status: "RUNNING",
        attempts:
          state.status === "RUNNING" && runtime.activeNodeId === nodeId
            ? state.attempts
            : state.attempts + 1,
        errorCode: null,
      },
    },
  };
}

export function retrySerialMissionGraphNode(
  runtime: MissionGraphRuntimeV2,
  nodeId: string,
  errorCode: string
): MissionGraphRuntimeV2 | null {
  if (runtime.activeNodeId !== nodeId || runtime.nodes[nodeId]?.status !== "RUNNING") return null;
  return {
    ...runtime,
    activeNodeId: null,
    nodes: {
      ...runtime.nodes,
      [nodeId]: { ...runtime.nodes[nodeId]!, status: "PENDING", errorCode },
    },
  };
}

export function finishSerialMissionGraphNode(
  runtime: MissionGraphRuntimeV2,
  nodeId: string,
  result: { status: "PASSED" | "FAILED"; errorCode?: string | null }
): MissionGraphRuntimeV2 | null {
  if (runtime.activeNodeId !== nodeId || runtime.nodes[nodeId]?.status !== "RUNNING") return null;
  return {
    ...runtime,
    activeNodeId: null,
    nodes: {
      ...runtime.nodes,
      [nodeId]: {
        ...runtime.nodes[nodeId]!,
        status: result.status,
        errorCode: result.errorCode ?? null,
      },
    },
  };
}

export function isSerialMissionGraphComplete(runtime: MissionGraphRuntimeV2): boolean {
  return Object.values(runtime.nodes).length > 0 &&
    Object.values(runtime.nodes).every((node) => node.status === "PASSED");
}
