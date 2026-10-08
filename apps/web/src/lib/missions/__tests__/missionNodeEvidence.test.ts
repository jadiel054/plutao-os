import { describe, expect, it } from "vitest";
import { selectMissionNodeEvidence } from "../missionNodeEvidence";

describe("selectMissionNodeEvidence", () => {
  it("isola execution e nó, e não considera GATE_PENDING como efeito executado", () => {
    const evidence = [
      { id: "read", executionId: "exec-1", content: "leitura concluída", metadata: { missionNodeId: "node-a" } },
      { id: "pending", executionId: "exec-1", content: "Tool github result: GATE_PENDING\\ngate_id: g-1", metadata: { missionNodeId: "node-a" } },
      { id: "approved", executionId: "exec-1", content: "gate aprovado e executado: github/push_files", metadata: { missionNodeId: "node-a" } },
      { id: "other-node", executionId: "exec-1", content: "evidência diferente", metadata: { missionNodeId: "node-b" } },
      { id: "other-execution", executionId: "exec-2", content: "execução anterior", metadata: { missionNodeId: "node-a" } },
    ];

    expect(selectMissionNodeEvidence(evidence, "exec-1", "node-a").map((item) => item.id)).toEqual([
      "read",
      "approved",
    ]);
  });
});
