import { describe, expect, it } from "vitest";
import type { MissionGraphV2 } from "@plutao/domain";
import {
  finishSerialMissionGraphNode,
  initializeMissionGraphRuntime,
  isSerialMissionGraphComplete,
  nextSerialMissionGraphNode,
  retrySerialMissionGraphNode,
  startSerialMissionGraphNode,
} from "@/lib/missions/serialGraphRuntime";
import { resolveRuntimeJobOutcome } from "@/lib/runtime/durableJobs";

const canaryGraph: MissionGraphV2 = {
  version: 2,
  nodes: [
    {
      id: "read-node",
      kind: "work",
      title: "Ler o estado",
      description: "Produzir a evidência de leitura",
      definitionOfDone: "evidence de leitura",
      specialistProfileId: null,
      requiredCapabilities: [],
      dependsOn: [],
      retryPolicy: { maxAttempts: 2, timeoutSeconds: 120 },
    },
    {
      id: "write-node",
      kind: "work",
      title: "Aplicar a mudança",
      description: "Executar a operação protegida por gate",
      definitionOfDone: "evidence de escrita aprovada",
      specialistProfileId: null,
      requiredCapabilities: [],
      dependsOn: ["read-node"],
      retryPolicy: { maxAttempts: 2, timeoutSeconds: 120 },
    },
  ],
};

type GateStatus = "pending" | "approved" | "rejected";

type CanaryEvidence = {
  id: string;
  executionId: string;
  nodeId: string;
  kind: "read" | "write";
};

function appendEvidenceIdempotently(
  evidence: CanaryEvidence[],
  item: CanaryEvidence
): CanaryEvidence[] {
  const duplicate = evidence.some(
    (entry) =>
      entry.executionId === item.executionId &&
      entry.nodeId === item.nodeId &&
      entry.kind === item.kind
  );
  return duplicate ? evidence : [...evidence, item];
}

describe("mission runtime canary contract", () => {
  it("executa dois nós dependentes, aguarda gate e só então conclui o job", () => {
    const executionId = "execution-canary-1";
    let gate: GateStatus = "pending";
    let evidence: CanaryEvidence[] = [];
    let runtime = initializeMissionGraphRuntime(canaryGraph, null)!;

    expect(nextSerialMissionGraphNode(canaryGraph, runtime)?.id).toBe("read-node");
    runtime = startSerialMissionGraphNode(canaryGraph, runtime, "read-node")!;
    evidence = appendEvidenceIdempotently(evidence, {
      id: "evidence-read",
      executionId,
      nodeId: "read-node",
      kind: "read",
    });
    runtime = finishSerialMissionGraphNode(runtime, "read-node", { status: "PASSED" })!;

    expect(nextSerialMissionGraphNode(canaryGraph, runtime)?.id).toBe("write-node");
    runtime = startSerialMissionGraphNode(canaryGraph, runtime, "write-node")!;
    expect(gate).toBe("pending");
    expect(isSerialMissionGraphComplete(runtime)).toBe(false);

    gate = "approved";
    evidence = appendEvidenceIdempotently(evidence, {
      id: "evidence-write",
      executionId,
      nodeId: "write-node",
      kind: "write",
    });
    runtime = finishSerialMissionGraphNode(runtime, "write-node", { status: "PASSED" })!;

    expect(evidence.map((item) => item.nodeId)).toEqual(["read-node", "write-node"]);
    expect(isSerialMissionGraphComplete(runtime)).toBe(true);
    expect(
      resolveRuntimeJobOutcome(null, "COMPLETED", "COMPLETED")
    ).toEqual({ action: "succeed", status: "SUCCEEDED", reason: "EXECUTION_COMPLETED" });
  });

  it("reivindica o mesmo nó após restart sem incrementar a tentativa e não duplica evidence", () => {
    const executionId = "execution-canary-reclaim";
    let evidence: CanaryEvidence[] = [
      { id: "evidence-read", executionId, nodeId: "read-node", kind: "read" },
    ];
    let runtime = initializeMissionGraphRuntime(canaryGraph, null)!;
    runtime = startSerialMissionGraphNode(canaryGraph, runtime, "read-node")!;
    const attemptsBeforeRestart = runtime.nodes["read-node"]!.attempts;

    const recovered = initializeMissionGraphRuntime(canaryGraph, runtime)!;
    expect(recovered.activeNodeId).toBe("read-node");
    expect(recovered.nodes["read-node"]!.attempts).toBe(attemptsBeforeRestart);
    expect(startSerialMissionGraphNode(canaryGraph, recovered, "read-node")!.nodes["read-node"]!.attempts).toBe(
      attemptsBeforeRestart
    );

    evidence = appendEvidenceIdempotently(evidence, {
      id: "duplicate-read",
      executionId,
      nodeId: "read-node",
      kind: "read",
    });
    expect(evidence).toHaveLength(1);

    const retryable = retrySerialMissionGraphNode(recovered, "read-node", "MODEL_TIMEOUT")!;
    const retried = startSerialMissionGraphNode(canaryGraph, retryable, "read-node")!;
    expect(retried.nodes["read-node"]!.attempts).toBe(attemptsBeforeRestart + 1);
    expect(retried.nodes["read-node"]!.status).toBe("RUNNING");
  });

  it("não transforma gate rejeitado ou execution não terminal em sucesso", () => {
    expect(resolveRuntimeJobOutcome({ error: "GATE_REJECTED" }, "RUNNING", "EXECUTING")).toEqual({
      action: "retry",
      status: "PENDING",
      reason: "EXECUTION_NOT_TERMINAL",
    });
    expect(resolveRuntimeJobOutcome({ error: "GATE_REJECTED" }, "FAILED", "FAILED")).toEqual({
      action: "fail",
      status: "FAILED",
      reason: "GATE_REJECTED",
    });
    expect(resolveRuntimeJobOutcome({ error: "CANCELLED_BY_USER" }, "CANCELLED", "CANCELLED")).toEqual({
      action: "cancel",
      status: "CANCELLED",
      reason: "CANCELLED_BY_USER",
    });
  });
});
