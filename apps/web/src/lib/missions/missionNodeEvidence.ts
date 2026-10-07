export type MissionNodeEvidence = {
  id?: string;
  executionId?: string | null;
  content: string;
  metadata?: Record<string, unknown>;
};

/** Evidence is scoped to one durable execution and one graph node. A pending
 * approval request is not proof that the external write was performed. */
export function selectMissionNodeEvidence(
  evidence: MissionNodeEvidence[],
  executionId: string,
  nodeId: string
): MissionNodeEvidence[] {
  return evidence.filter(
    (item) =>
      item.executionId === executionId &&
      item.metadata?.missionNodeId === nodeId &&
      !item.content.includes("GATE_PENDING")
  );
}
