import { describe, expect, it } from "vitest";
/**
 * Teste da integração usada pela rota /api/agentic/assist:
 * percepção estruturada (ui-perception) + diagnóstico (guided-assist)
 * compostos exatamente como o handler POST compõe.
 */
import { describePage } from "../ui-perception";
import { buildGuidedPlan, diagnosePage } from "../guided-assist";
import { parseVoiceCommand, respondToVoiceCommand } from "../voice-assist";

describe("pipeline da rota /api/agentic/assist", () => {
  it("descreve a página e diagnostica a partir do mesmo pageState", () => {
    const pageState = {
      pageId: "chat",
      visibleText: "Bom dia. Eu sou Nix.",
      controls: [{ id: "chat.input" }],
    };
    const description = describePage("chat", pageState);
    expect(description?.pageId).toBe("chat");
    expect(description?.controls.find((c) => c.id === "chat.input")?.state).toBeUndefined();

    const diagnosis = diagnosePage("chat", pageState);
    expect(diagnosis.findings.some((f) => f.problem.includes("chat.send"))).toBe(true);
  });

  it("comando guiado produz plano e descrição no mesmo formato do handler", () => {
    const command = parseVoiceCommand("Configure um conector");
    expect(command.intent).toBe("guided_goal");
    const response = respondToVoiceCommand(command, { pageId: "chat", hasPageState: true });
    const guided = command.intent === "guided_goal" ? buildGuidedPlan(command.raw) : null;
    expect(guided?.steps.length).toBeGreaterThan(0);
    expect(response.reply.length).toBeGreaterThan(0);
  });
});
