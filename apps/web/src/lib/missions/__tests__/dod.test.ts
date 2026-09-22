import { describe, expect, it } from "vitest";
import { verifyDefinitionOfDone } from "../dod";

describe("Definition of Done for execution evidence", () => {
  const base = {
    objective: "Listar os repositórios do GitHub",
    definitionOfDone: "repos_list",
  };

  it("does not pass with only a tool error", () => {
    const result = verifyDefinitionOfDone({
      ...base,
      evidence: [
        {
          id: "ev-error",
          type: "tool_error",
          source: "tool_dispatcher",
          content: "tool:github error: GitHub não conectado",
        },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "has_tool_result")?.passed).toBe(false);
  });

  it("passes the tool-result gate with a successful GitHub read", () => {
    const result = verifyDefinitionOfDone({
      ...base,
      evidence: [
        {
          id: "ev-model",
          type: "model_step",
          source: "model:groq:test",
          content: "Vou listar os repositórios.",
        },
        {
          id: "ev-tool",
          type: "tool_result",
          source: "tool_dispatcher",
          content: "tool:github → repos_list (1):\n- jadiel054/plutao-os (public) · main",
        },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.checks.find((check) => check.id === "has_tool_result")?.passed).toBe(true);
  });

  it("does not treat a model-only response as a completed tool mission", () => {
    const result = verifyDefinitionOfDone({
      ...base,
      evidence: [
        {
          id: "ev-model",
          type: "model_step",
          source: "model:groq:test",
          content: "A missão está concluída.",
        },
      ],
    });

    expect(result.passed).toBe(false);
  });
});
