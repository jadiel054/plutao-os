import { and, eq } from "drizzle-orm";
import { missions } from "@plutao/db";
import {
  applyStepTransition,
  getMissionGraphSerialOrder,
  parseMissionPlan,
  type MissionGraphV2,
  type MissionPlanV1,
} from "@plutao/domain";
import { getDb } from "@/lib/db";
import { getOwnedMission, parseEvidence } from "@/lib/missions/ownership";
import { listWriteGatesForExecution } from "@/lib/connectors/gates";
import { verifyDefinitionOfDone } from "@/lib/missions/dod";
import { selectMissionNodeEvidence } from "@/lib/missions/missionNodeEvidence";
import {
  finishSerialMissionGraphNode,
  initializeMissionGraphRuntime,
  isSerialMissionGraphComplete,
  nextSerialMissionGraphNode,
  retrySerialMissionGraphNode,
  startSerialMissionGraphNode,
  type MissionGraphRuntimeV2,
} from "@/lib/missions/serialGraphRuntime";
import { MAX_TOTAL_ITERATIONS, runAgentLoop } from "@/lib/runtime/agent-loop";
import { getOwnedExecution, writeCheckpoint } from "@/lib/runtime/service";

type SerialGraphResult =
  | { kind: "complete"; iterations: number }
  | { kind: "continuation"; iterations: number; nodeId: string }
  | { kind: "waiting_approval"; iterations: number; nodeId: string }
  | { kind: "failed"; iterations: number; nodeId?: string; error: string; stopReason: string };

async function persistRuntime(
  executionId: string,
  userId: string,
  runtime: MissionGraphRuntimeV2
): Promise<boolean> {
  const result = await writeCheckpoint(executionId, userId, {
    missionGraphRuntime: runtime as unknown as Record<string, unknown>,
  });
  return !("error" in result);
}

async function hasUnresolvedWriteGate(
  executionId: string,
  userId: string,
  evidence: ReturnType<typeof parseEvidence>
) {
  const gates = await listWriteGatesForExecution(executionId, userId);
  const evidenceGateIds = new Set(
    evidence
      .map((item) => item.metadata?.writeGateId)
      .filter((value): value is string => typeof value === "string")
  );
  return gates.some(
    (gate) =>
      ["pending", "approved", "executing"].includes(String(gate.status)) ||
      (gate.status === "executed" && !evidenceGateIds.has(gate.id))
  );
}

async function syncLegacyPlanNode(
  missionId: string,
  userId: string,
  nodeId: string,
  target: "RUNNING" | "PASSED"
): Promise<boolean> {
  const mission = await getOwnedMission(missionId, userId);
  if (!mission) return false;
  const plan = parseMissionPlan(mission.plan);
  if (!plan || !plan.aligned) return true;
  const step = plan.steps.find((item) => item.id === nodeId);
  if (!step) return true;
  if (target === "RUNNING" && ["RUNNING", "PASSED"].includes(step.status)) return true;
  if (target === "PASSED" && step.status === "PASSED") return true;

  let nextPlan: MissionPlanV1 | null = plan;
  if (target === "RUNNING") {
    nextPlan = applyStepTransition(plan, nodeId, "RUNNING", {
      eventLabel: `Nó iniciado: ${step.title}`,
      eventDetail: "Liberado pelo scheduler serial do grafo v2",
    });
  } else {
    if (step.status !== "RUNNING") {
      nextPlan = applyStepTransition(plan, nodeId, "RUNNING", {
        eventLabel: `Nó iniciado: ${step.title}`,
        eventDetail: "Liberado pelo scheduler serial do grafo v2",
      });
    }
    if (nextPlan) {
      nextPlan = applyStepTransition(nextPlan, nodeId, "PASSED", {
        eventLabel: `Nó verificado: ${step.title}`,
        eventDetail: "Definition of Done do nó satisfeita por evidências",
      });
    }
  }
  if (!nextPlan) return false;

  const completedSteps = nextPlan.steps
    .filter((item) => item.status === "PASSED")
    .map((item) => item.title);
  const pendingSteps = nextPlan.steps
    .filter((item) => item.status !== "PASSED" && item.status !== "CANCELLED")
    .map((item) => item.title);
  const db = getDb();
  await db
    .update(missions)
    .set({ plan: nextPlan, completedSteps, pendingSteps, updatedAt: new Date() })
    .where(and(eq(missions.id, missionId), eq(missions.userId, userId)));
  return true;
}

/** Executes no more than one graph node per durable worker invocation. */
export async function runNextMissionGraphNodeSerial(opts: {
  missionId: string;
  userId: string;
  executionId: string;
  graph: MissionGraphV2;
  maxIterations: number;
}): Promise<SerialGraphResult> {
  const order = getMissionGraphSerialOrder(opts.graph);
  if (!order) {
    return {
      kind: "failed",
      iterations: 0,
      error: "MISSION_GRAPH_INVALID_OR_SERIAL_LIMIT",
      stopReason: "MISSION_GRAPH_INVALID_OR_SERIAL_LIMIT",
    };
  }
  const unsupportedNode = order.find(
    (node) =>
      node.kind === "approval" ||
      node.specialistProfileId !== null ||
      node.requiredCapabilities.length > 0
  );
  if (unsupportedNode) {
    return {
      kind: "failed",
      iterations: 0,
      nodeId: unsupportedNode.id,
      error: "MISSION_GRAPH_NODE_FEATURE_NOT_ENABLED",
      stopReason: "MISSION_GRAPH_NODE_FEATURE_NOT_ENABLED",
    };
  }

  const [execution, mission] = await Promise.all([
    getOwnedExecution(opts.executionId, opts.userId),
    getOwnedMission(opts.missionId, opts.userId),
  ]);
  if (!execution || !mission) {
    return {
      kind: "failed",
      iterations: 0,
      error: !execution ? "EXECUTION_NOT_FOUND" : "MISSION_NOT_FOUND",
      stopReason: "MISSION_GRAPH_CONTEXT_NOT_FOUND",
    };
  }

  const checkpoint =
    execution.checkpoint && typeof execution.checkpoint === "object"
      ? (execution.checkpoint as Record<string, unknown>)
      : {};
  const previousRuntime = checkpoint.missionGraphRuntime;
  let runtime = initializeMissionGraphRuntime(opts.graph, previousRuntime);
  if (!runtime) {
    return {
      kind: "failed",
      iterations: 0,
      error: "MISSION_GRAPH_CHECKPOINT_MISMATCH",
      stopReason: "MISSION_GRAPH_CHECKPOINT_MISMATCH",
    };
  }
  if (!previousRuntime && !(await persistRuntime(opts.executionId, opts.userId, runtime))) {
    return {
      kind: "failed",
      iterations: 0,
      error: "MISSION_GRAPH_CHECKPOINT_WRITE_FAILED",
      stopReason: "MISSION_GRAPH_CHECKPOINT_WRITE_FAILED",
    };
  }
  if (isSerialMissionGraphComplete(runtime)) return { kind: "complete", iterations: 0 };

  const node = nextSerialMissionGraphNode(opts.graph, runtime);
  if (!node) {
    return {
      kind: "failed",
      iterations: 0,
      error: "MISSION_GRAPH_DEPENDENCY_BLOCKED",
      stopReason: "MISSION_GRAPH_DEPENDENCY_BLOCKED",
    };
  }

  const nodeState = runtime.nodes[node.id]!;
  const resumingActiveAttempt = runtime.activeNodeId === node.id && nodeState.status === "RUNNING";
  if (!resumingActiveAttempt && nodeState.attempts >= node.retryPolicy.maxAttempts) {
    return {
      kind: "failed",
      iterations: 0,
      nodeId: node.id,
      error: "MISSION_GRAPH_NODE_ATTEMPTS_EXHAUSTED",
      stopReason: "MISSION_GRAPH_NODE_ATTEMPTS_EXHAUSTED",
    };
  }

  if (!resumingActiveAttempt) {
    runtime = startSerialMissionGraphNode(opts.graph, runtime, node.id)!;
    if (!(await persistRuntime(opts.executionId, opts.userId, runtime))) {
      return {
        kind: "failed",
        iterations: 0,
        nodeId: node.id,
        error: "MISSION_GRAPH_CHECKPOINT_WRITE_FAILED",
        stopReason: "MISSION_GRAPH_CHECKPOINT_WRITE_FAILED",
      };
    }
    if (!(await syncLegacyPlanNode(opts.missionId, opts.userId, node.id, "RUNNING"))) {
      return {
        kind: "failed",
        iterations: 0,
        nodeId: node.id,
        error: "MISSION_PLAN_STEP_TRANSITION_FAILED",
        stopReason: "MISSION_PLAN_STEP_TRANSITION_FAILED",
      };
    }
  }

  let totalIterations = 0;
  const perNodeIterationBudget = Math.max(
    1,
    Math.min(opts.maxIterations, Math.floor(MAX_TOTAL_ITERATIONS / order.length))
  );

  if (await hasUnresolvedWriteGate(opts.executionId, opts.userId, parseEvidence(mission.evidence))) {
    return { kind: "waiting_approval", iterations: 0, nodeId: node.id };
  }

  while (true) {
    const currentAttempt = runtime.nodes[node.id]!.attempts;
    const loop = await runAgentLoop(
      opts.executionId,
      opts.userId,
      perNodeIterationBudget
    );
    totalIterations += loop.iterations;

    const freshMission = await getOwnedMission(opts.missionId, opts.userId);
    const evidence = selectMissionNodeEvidence(
      parseEvidence(freshMission?.evidence),
      opts.executionId,
      node.id
    );
    if (await hasUnresolvedWriteGate(opts.executionId, opts.userId, parseEvidence(freshMission?.evidence))) {
      return { kind: "waiting_approval", iterations: totalIterations, nodeId: node.id };
    }
    const nodeDod = verifyDefinitionOfDone({
      objective: node.title,
      definitionOfDone: node.definitionOfDone,
      evidence,
    });

    if (nodeDod.passed) {
      if (!(await syncLegacyPlanNode(opts.missionId, opts.userId, node.id, "PASSED"))) {
        return {
          kind: "failed",
          iterations: totalIterations,
          nodeId: node.id,
          error: "MISSION_PLAN_STEP_TRANSITION_FAILED",
          stopReason: "MISSION_PLAN_STEP_TRANSITION_FAILED",
        };
      }
      const completed = finishSerialMissionGraphNode(runtime, node.id, { status: "PASSED" });
      if (!completed || !(await persistRuntime(opts.executionId, opts.userId, completed))) {
        return {
          kind: "failed",
          iterations: totalIterations,
          nodeId: node.id,
          error: "MISSION_GRAPH_CHECKPOINT_WRITE_FAILED",
          stopReason: "MISSION_GRAPH_CHECKPOINT_WRITE_FAILED",
        };
      }
      if (isSerialMissionGraphComplete(completed)) {
        return { kind: "complete", iterations: totalIterations };
      }
      return { kind: "continuation", iterations: totalIterations, nodeId: node.id };
    }

    const failureCode = loop.error ?? loop.stopReason ?? "MISSION_NODE_DOD_FAILED";
    if (currentAttempt < node.retryPolicy.maxAttempts) {
      const retrying = retrySerialMissionGraphNode(runtime, node.id, failureCode);
      if (!retrying || !(await persistRuntime(opts.executionId, opts.userId, retrying))) {
        return {
          kind: "failed",
          iterations: totalIterations,
          nodeId: node.id,
          error: "MISSION_GRAPH_CHECKPOINT_WRITE_FAILED",
          stopReason: "MISSION_GRAPH_CHECKPOINT_WRITE_FAILED",
        };
      }
      const restarted = startSerialMissionGraphNode(opts.graph, retrying, node.id);
      if (!restarted || !(await persistRuntime(opts.executionId, opts.userId, restarted))) {
        return {
          kind: "failed",
          iterations: totalIterations,
          nodeId: node.id,
          error: "MISSION_GRAPH_CHECKPOINT_WRITE_FAILED",
          stopReason: "MISSION_GRAPH_CHECKPOINT_WRITE_FAILED",
        };
      }
      runtime = restarted;
      continue;
    }

    const failed = finishSerialMissionGraphNode(runtime, node.id, {
      status: "FAILED",
      errorCode: failureCode,
    });
    if (failed) await persistRuntime(opts.executionId, opts.userId, failed);
    return {
      kind: "failed",
      iterations: totalIterations,
      nodeId: node.id,
      error: `MISSION_NODE_DOD_FAILED:${nodeDod.summary}`,
      stopReason: loop.stopReason,
    };
  }
}
