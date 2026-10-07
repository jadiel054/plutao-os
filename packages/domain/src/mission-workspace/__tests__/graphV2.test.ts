import { describe, expect, it } from "vitest";
import {
  missionPlanV1ToGraphV2,
  validateMissionGraphV2,
  type MissionGraphV2,
} from "../graphV2";
import { createPlanFromTitles } from "../types";

function node(
  id: string,
  dependsOn: string[] = [],
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    kind: "work",
    title: `Tarefa ${id}`,
    description: null,
    definitionOfDone: null,
    specialistProfileId: null,
    requiredCapabilities: [],
    dependsOn,
    retryPolicy: { maxAttempts: 1, timeoutSeconds: 120 },
    ...overrides,
  };
}

function graph(nodes: unknown[]): unknown {
  return { version: 2, nodes };
}

describe("MissionGraphV2 contract", () => {
  it("accepts a DAG with independent work and a join", () => {
    const result = validateMissionGraphV2(
      graph([node("research-a"), node("research-b"), node("synthesis", ["research-a", "research-b"])])
    );
    expect(result.ok).toBe(true);
  });

  it("converts V1 ordered steps into a linear graph preserving step ids", () => {
    const plan = createPlanFromTitles(["Entender", "Implementar", "Verificar"]);
    // Simulate a serialized/reordered V1 payload: order is governed by index.
    const reordered = {
      ...plan,
      steps: [
        { ...plan.steps[2]!, index: 2 },
        { ...plan.steps[0]!, index: 0 },
        { ...plan.steps[1]!, index: 1 },
      ],
    };
    const migrated = missionPlanV1ToGraphV2(reordered);

    expect(migrated.version).toBe(2);
    expect(migrated.nodes.map((item) => item.title)).toEqual([
      "Entender",
      "Implementar",
      "Verificar",
    ]);
    expect(migrated.nodes.map((item) => item.dependsOn)).toEqual([
      [],
      [plan.steps[0]!.id],
      [plan.steps[1]!.id],
    ]);
    expect(validateMissionGraphV2(migrated).ok).toBe(true);
  });

  it("rejects a cycle before execution", () => {
    const result = validateMissionGraphV2(
      graph([node("a", ["b"]), node("b", ["a"])])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === "CYCLE_DETECTED")).toBe(true);
    }
  });

  it("rejects missing, self, and duplicate dependencies", () => {
    const result = validateMissionGraphV2(
      graph([
        node("a", ["missing"]),
        node("b", ["b"]),
        node("c", ["a", "a"]),
      ])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.issues.map((issue) => issue.code);
      expect(codes).toContain("MISSING_DEPENDENCY");
      expect(codes).toContain("SELF_DEPENDENCY");
      expect(codes).toContain("DUPLICATE_DEPENDENCY");
    }
  });

  it("rejects duplicate node ids and unknown node kinds", () => {
    const result = validateMissionGraphV2(
      graph([node("same"), node("same"), node("bad", [], { kind: "unregistered-kind" })])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain("DUPLICATE_NODE_ID");
      expect(result.issues.map((issue) => issue.code)).toContain("INVALID_NODE");
    }
  });

  it("bounds retries and the overall graph size", () => {
    const invalidRetry = validateMissionGraphV2(
      graph([node("a", [], { retryPolicy: { maxAttempts: 99, timeoutSeconds: 120 } })])
    );
    expect(invalidRetry.ok).toBe(false);
    if (!invalidRetry.ok) {
      expect(invalidRetry.issues.map((issue) => issue.code)).toContain("INVALID_RETRY_POLICY");
    }

    const tooMany = validateMissionGraphV2(
      graph(Array.from({ length: 101 }, (_, index) => node(`n-${index}`)))
    );
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) {
      expect(tooMany.issues.map((issue) => issue.code)).toContain("NODE_COUNT_OUT_OF_RANGE");
    }
  });

  it("keeps the public graph value typed after successful validation", () => {
    const candidate = graph([node("only")]) as MissionGraphV2;
    const result = validateMissionGraphV2(candidate);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.graph.nodes[0]?.id).toBe("only");
  });
});
