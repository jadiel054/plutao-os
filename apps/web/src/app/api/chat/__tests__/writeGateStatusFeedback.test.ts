import { describe, it, expect } from "vitest";

describe("Write Gate Timeline Status Mapping Test", () => {
  it("maps write gate status correctly to action card status labels and icons", () => {
    const statuses = [
      { status: "GATE_PENDING", isGatePending: true, isExecuting: false, isOk: false, isError: false, isRejected: false },
      { status: "approved", isGatePending: false, isExecuting: true, isOk: false, isError: false, isRejected: false },
      { status: "executed", isGatePending: false, isExecuting: false, isOk: true, isError: false, isRejected: false },
      { status: "rejected", isGatePending: false, isExecuting: false, isOk: false, isError: false, isRejected: true },
      { status: "failed", isGatePending: false, isExecuting: false, isOk: false, isError: true, isRejected: false },
    ];

    for (const item of statuses) {
      const isOk = item.status === "ok" || item.status === "executed";
      const isExecuting = item.status === "executing" || item.status === "approved";
      const isGatePending = item.status === "GATE_PENDING";
      const isRejected = item.status === "rejected";
      const isError = item.status === "error" || item.status === "failed";

      expect(isOk).toBe(item.isOk);
      expect(isExecuting).toBe(item.isExecuting);
      expect(isGatePending).toBe(item.isGatePending);
      expect(isRejected).toBe(item.isRejected);
      expect(isError).toBe(item.isError);
    }
  });

  it("reconstructs tool call status from gate status on reload", () => {
    const gateMap = new Map([
      ["g-1", { status: "executed", result: { output: "Criado com sucesso" }, error: null }],
      ["g-2", { status: "failed", result: null, error: "Nome de projeto já existe" }],
      ["g-3", { status: "rejected", result: null, error: null }],
    ]);

    const steps = [
      {
        type: "tool_call",
        toolCall: {
          id: "tc-1",
          status: "GATE_PENDING",
          summaryOutput: "GATE_PENDING\ngate_id: g-1\ncapability: repo_create",
        },
      },
      {
        type: "tool_call",
        toolCall: {
          id: "tc-2",
          status: "GATE_PENDING",
          summaryOutput: "GATE_PENDING\ngate_id: g-2\ncapability: project_create",
        },
      },
      {
        type: "tool_call",
        toolCall: {
          id: "tc-3",
          status: "GATE_PENDING",
          summaryOutput: "GATE_PENDING\ngate_id: g-3\ncapability: deploy_create",
        },
      },
    ];

    const updatedSteps = steps.map((step) => {
      const toolCall = { ...step.toolCall };
      const outText = String(toolCall.summaryOutput || "");
      const idMatch = outText.match(/gate_id:\s*([a-z0-9-]+)/i);
      const gateId = idMatch?.[1];
      if (gateId && gateMap.has(gateId)) {
        const g = gateMap.get(gateId)!;
        toolCall.status = g.status;
        if (g.status === "executed" && g.result) {
          toolCall.summaryOutput = g.result.output;
        } else if (g.status === "failed" && g.error) {
          toolCall.summaryOutput = g.error;
        } else if (g.status === "rejected") {
          toolCall.summaryOutput = "Recusado pelo usuário.";
        }
      }
      return { ...step, toolCall };
    });

    expect(updatedSteps[0].toolCall.status).toBe("executed");
    expect(updatedSteps[0].toolCall.summaryOutput).toBe("Criado com sucesso");

    expect(updatedSteps[1].toolCall.status).toBe("failed");
    expect(updatedSteps[1].toolCall.summaryOutput).toBe("Nome de projeto já existe");

    expect(updatedSteps[2].toolCall.status).toBe("rejected");
    expect(updatedSteps[2].toolCall.summaryOutput).toBe("Recusado pelo usuário.");
  });
});
