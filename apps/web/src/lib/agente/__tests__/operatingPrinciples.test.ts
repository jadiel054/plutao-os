import { describe, it, expect } from "vitest";
import { NIX_IDENTITY, OPERATOR_GOLDEN_RULE } from "../operating-principles";

describe("operating principles", () => {
  it("exports NIX_IDENTITY with exact agent identity sentence", () => {
    expect(NIX_IDENTITY).toBe("Você é Nix, o operador do Plutão OS, assistente pessoal do usuário.");
  });

  it("exports OPERATOR_GOLDEN_RULE containing all 3 required operator verification rules", () => {
    expect(OPERATOR_GOLDEN_RULE).toBeDefined();
    expect(OPERATOR_GOLDEN_RULE).toContain("Depois de qualquer escrita: (1) releia o que escreveu");
    expect(OPERATOR_GOLDEN_RULE).toContain("(2) se houver CI, consulte o status da run (workflows_list → runs_list → runs_logs) e só declare sucesso quando verde");
    expect(OPERATOR_GOLDEN_RULE).toContain("(3) se falhar, leia o log, corrija e repita — nunca declare 'pronto' sem verificação.");
    expect(OPERATOR_GOLDEN_RULE).toContain("Se não conseguir verificar, diga explicitamente o que não foi verificado.");
  });
});
