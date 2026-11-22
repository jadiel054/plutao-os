import { describe, expect, it } from "vitest";
import {
  buildChatAutoIdempotencyKey,
  detectAffirmativeConfirmation,
  detectBuildIntent,
  hasNumberedPlan,
  pickObjective,
} from "../autoMissionRules";

describe("autoMissionRules", () => {
  it("detecta pedidos de construção de software", () => {
    expect(detectBuildIntent("crie um site estático de padaria com página única")).toBe(true);
    expect(detectBuildIntent("desenvolva um app de tarefas")).toBe(true);
    expect(detectBuildIntent("faça um sistema de vendas em HTML/CSS")).toBe(true);
  });

  it("não vira missão em consultas e análises", () => {
    expect(detectBuildIntent("analise o repositório plutao-os")).toBe(false);
    expect(detectBuildIntent("me explique como funciona o app")).toBe(false);
    expect(detectBuildIntent("resumo")).toBe(false);
    expect(detectBuildIntent("")).toBe(false);
  });

  it("detecta confirmação afirmativa curta", () => {
    expect(detectAffirmativeConfirmation("Público.")).toBe(false);
    expect(detectAffirmativeConfirmation("Pode")).toBe(true);
    expect(detectAffirmativeConfirmation("sim, pode criar")).toBe(true);
    expect(detectAffirmativeConfirmation("")).toBe(false);
    expect(detectAffirmativeConfirmation("analise isso de novo com cuidado")).toBe(false);
  });

  it("reconhece plano numerado proposto pelo assistente", () => {
    const plan = "Plano recomendado:\n1. Criar repositório\n2. Gerar arquivos\n3. Commit inicial";
    expect(hasNumberedPlan(plan)).toBe(true);
    expect(hasNumberedPlan("Vou verificar isso depois.")).toBe(false);
  });

  it("escolhe objetivo com substantivo de software do histórico", () => {
    const objective = pickObjective(
      [
        { role: "user", content: "crie um site de padaria" },
        { role: "assistant", content: "Plano:\n1. Isso\n2. Aquilo\n3. Outro" },
        { role: "user", content: "Público." },
      ],
      "Público."
    );
    expect(objective).toContain("site de padaria");
  });

  it("idempotência estável por conversa e objetivo", () => {
    expect(buildChatAutoIdempotencyKey("conv", "crie um site")).toBe(
      buildChatAutoIdempotencyKey("conv", "crie um site")
    );
    expect(buildChatAutoIdempotencyKey("conv", "crie um site")).not.toBe(
      buildChatAutoIdempotencyKey("conv2", "crie um site")
    );
  });
});
