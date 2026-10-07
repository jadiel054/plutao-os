import { describe, expect, it } from "vitest";
import type { MissionGraphV2 } from "@plutao/domain";
import {
  finishSerialMissionGraphNode,
  initializeMissionGraphRuntime,
  isSerialMissionGraphComplete,
  nextSerialMissionGraphNode,
  retrySerialMissionGraphNode,
  startSerialMissionGraphNode,
} from "../serialGraphRuntime";

const graph: MissionGraphV2 = {
  version: 2,
  nodes: [
    {
      id: "final",
      kind: "work",
      title: "Finalizar",
      specialistProfileId: null,
      requiredCapabilities: [],
      dependsOn: ["middle"],
      retryPolicy: { maxAttempts: 1, timeoutSeconds: 120 },
    },
    {
      id: "first",
      kind: "work",
      title: "Primeiro independente",
      specialistProfileId: null,
      requiredCapabilities: [],
      dependsOn: [],
      retryPolicy: { maxAttempts: 1, timeoutSeconds: 120 },
    },
    {
      id: "middle",
      kind: "work",
      title: "Meio",
      specialistProfileId: null,
      requiredCapabilities: [],
      dependsOn: ["first"],
      retryPolicy: { maxAttempts: 1, timeoutSeconds: 120 },
    },
  ],
};

describe("serial mission graph runtime", () => {
  it("releases exactly one ready node and waits for dependencies to pass", () => {
    let state = initializeMissionGraphRuntime(graph, null);
    expect(state).not.toBeNull();
    if (!state) return;

    expect(nextSerialMissionGraphNode(graph, state)?.id).toBe("first");
    expect(startSerialMissionGraphNode(graph, state, "middle")).toBeNull();

    state = startSerialMissionGraphNode(graph, state, "first");
    expect(state?.activeNodeId).toBe("first");
    expect(nextSerialMissionGraphNode(graph, state!)?.id).toBe("first");
    expect(startSerialMissionGraphNode(graph, state!, "final")).toBeNull();

    state = finishSerialMissionGraphNode(state!, "first", { status: "PASSED" });
    expect(state?.activeNodeId).toBeNull();
    expect(nextSerialMissionGraphNode(graph, state!)?.id).toBe("middle");
  });

  it("persists a valid runtime checkpoint and refuses a corrupted or different graph schedule", () => {
    const initial = initializeMissionGraphRuntime(graph, null);
    expect(initial).not.toBeNull();
    const active = startSerialMissionGraphNode(graph, initial!, "first");
    expect(initializeMissionGraphRuntime(graph, active)).toEqual(active);
    expect(
      initializeMissionGraphRuntime(
        { ...graph, nodes: graph.nodes.map((node) => node.id === "final" ? { ...node, dependsOn: [] } : node) },
        active
      )
    ).toBeNull();
    expect(initializeMissionGraphRuntime(graph, { ...active, activeNodeId: "middle" })).toBeNull();
    const dependencyViolation = {
      ...initial!,
      activeNodeId: "middle",
      nodes: {
        ...initial!.nodes,
        middle: { status: "RUNNING" as const, attempts: 1 },
      },
    };
    expect(initializeMissionGraphRuntime(graph, dependencyViolation)).toBeNull();
  });

  it("finishes only after all nodes pass and records failures as terminal for the graph run", () => {
    let state = initializeMissionGraphRuntime(graph, null)!;
    state = startSerialMissionGraphNode(graph, state, "first")!;
    state = finishSerialMissionGraphNode(state, "first", { status: "PASSED" })!;
    state = startSerialMissionGraphNode(graph, state, "middle")!;
    state = finishSerialMissionGraphNode(state, "middle", { status: "FAILED", errorCode: "DOD_FAILED" })!;

    expect(isSerialMissionGraphComplete(state)).toBe(false);
    expect(nextSerialMissionGraphNode(graph, state)).toBeNull();
  });

  it("keeps a recovered RUNNING node on the same attempt, but increments an explicit retry", () => {
    let state = initializeMissionGraphRuntime(graph, null)!;
    state = startSerialMissionGraphNode(graph, state, "first")!;
    const attemptsBeforeRecovery = state.nodes.first!.attempts;
    state = startSerialMissionGraphNode(graph, state, "first")!;
    expect(state.nodes.first!.attempts).toBe(attemptsBeforeRecovery);

    state = retrySerialMissionGraphNode(state, "first", "DOD_FAILED")!;
    state = startSerialMissionGraphNode(graph, state, "first")!;
    expect(state.nodes.first!.attempts).toBe(attemptsBeforeRecovery + 1);
  });
});
