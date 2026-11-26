import { describe, expect, it } from "vitest";
import { deriveAgentActivity } from "../activityState";

describe("deriveAgentActivity", () => {
  it("retorna null quando nao ha execucao nem conteudo", () => {
    expect(deriveAgentActivity([], false, false)).toBeNull();
  });

  it("deriva Preparando quando em streaming sem conteudo", () => {
    expect(deriveAgentActivity([], true, false)?.label).toBe("Preparando");
  });

  it("deriva Executando quando em streaming com conteudo", () => {
    expect(deriveAgentActivity([], true, true)?.label).toBe("Executando");
  });

  it("prioriza Aguardando autorizacao (GATE_PENDING)", () => {
    const activity = deriveAgentActivity(
      [{ provider: "github", status: "executing" }, { provider: "vercel", status: "GATE_PENDING" }],
      true,
      false,
    );
    expect(activity?.label).toBe("Aguardando autorização");
    expect(activity?.detail).toBe("vercel");
  });

  it("deriva Usando ferramenta quando ha tool call em execucao", () => {
    const activity = deriveAgentActivity([{ provider: "neon", status: "executing" }], true, true);
    expect(activity?.label).toBe("Usando ferramenta");
    expect(activity?.detail).toBe("neon");
  });

  it("deriva Falhou quando ha erro", () => {
    const activity = deriveAgentActivity([{ provider: "neon", status: "failed" }], false, true);
    expect(activity?.label).toBe("Falhou");
  });

  it("deriva Concluido quando tool calls terminaram com conteudo", () => {
    expect(deriveAgentActivity([{ provider: "github", status: "ok" }], false, true)?.label).toBe("Concluído");
  });
});
