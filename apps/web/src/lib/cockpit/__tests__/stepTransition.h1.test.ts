import { describe, expect, it } from "vitest";
import {
  applyStepTransition,
  createPlanFromTitles,
  type MissionPlanV1,
} from "@plutao/domain";

function alignedPlan(titles: string[]): MissionPlanV1 {
  const plan = createPlanFromTitles(titles, { objective: "H1 test" });
  return {
    ...plan,
    aligned: true,
    events: [
      ...plan.events,
      {
        id: "align-ev",
        kind: "aligned",
        label: "Plano alinhado com o usuário",
        detail: "Execução liberada",
        at: new Date().toISOString(),
      },
    ],
  };
}

describe("H1 step0 PENDING → RUNNING (domain)", () => {
  it("transitions step 0 to RUNNING when plan is aligned", () => {
    const plan = alignedPlan(["criar notes/h1-test.txt", "validar"]);
    const step0 = plan.steps[0]!;
    expect(step0.status).toBe("PENDING");

    const next = applyStepTransition(plan, step0.id, "RUNNING", {
      eventLabel: `Iniciando: ${step0.title}`,
    });

    expect(next).not.toBeNull();
    expect(next!.steps[0]!.status).toBe("RUNNING");
    expect(next!.steps[0]!.startedAt).toBeTruthy();
    expect(next!.currentStepIndex).toBe(0);
    expect(next!.events.some((e) => e.kind === "step_started")).toBe(true);
    expect(next!.steps[1]!.status).toBe("PENDING");
  });

  it("refuses RUNNING on step 1 while step 0 is still PENDING", () => {
    const plan = alignedPlan(["a", "b"]);
    const step1 = plan.steps[1]!;
    const next = applyStepTransition(plan, step1.id, "RUNNING");
    expect(next).toBeNull();
  });
});
