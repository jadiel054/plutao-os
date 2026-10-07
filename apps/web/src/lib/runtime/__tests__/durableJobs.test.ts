import { describe, expect, it } from "vitest";
import { resolveRuntimeJobOutcome } from "../durableJobs";

describe("runtime job state machine", () => {
  it("marca SUCCEEDED somente quando a execution persistida está COMPLETED", () => {
    expect(resolveRuntimeJobOutcome({ ok: false, error: "MODEL_CALL_FAILED" }, "COMPLETED")).toEqual({
      action: "succeed",
      status: "SUCCEEDED",
      reason: "MODEL_CALL_FAILED",
    });
  });

  it("não transforma retorno ok em sucesso quando a execution está FAILED", () => {
    expect(resolveRuntimeJobOutcome({ ok: true }, "FAILED")).toEqual({
      action: "retry",
      status: "FAILED",
      reason: "EXECUTION_FAILED",
    });
  });

  it("recoloca em fila uma execution ainda não terminal", () => {
    expect(resolveRuntimeJobOutcome({ ok: true }, "RUNNING")).toEqual({
      action: "retry",
      status: "PENDING",
      reason: "EXECUTION_NOT_TERMINAL",
    });
  });

  it("propaga cancelamento explicitamente", () => {
    expect(resolveRuntimeJobOutcome({ ok: true }, "CANCELLED")).toEqual({
      action: "cancel",
      status: "CANCELLED",
      reason: "EXECUTION_CANCELLED",
    });
  });
});
