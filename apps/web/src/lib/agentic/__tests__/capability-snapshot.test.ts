import { describe, expect, it } from "vitest";
import { learnedFromExperiences } from "../capability-snapshot";
import type { ExperienceRecord } from "../experience-store";

const now = "2026-11-27T12:00:00Z";
const rec = (over: Partial<ExperienceRecord>): ExperienceRecord => ({
  id: "uuid-1", subject: "tool-learning:ci-api", method: "Contratos: GET /v1/runs", kind: "confirmed",
  observedAt: now, ...over,
});

describe("learnedFromExperiences", () => {
  it("mapeia apenas aprendizados (tool-learning:*)", () => {
    const caps = learnedFromExperiences([
      rec({}),
      rec({ id: "uuid-2", subject: "github", kind: "succeeded_experience" }),
      rec({ id: "uuid-3", subject: "tool-learning:outra", kind: "hypothesis" }),
    ]);
    expect(caps).toHaveLength(2);
    expect(caps[0].id).toBe("tool-learning:ci-api");
    expect(caps[0].source).toBe("learned");
    expect(caps[0].kind).toBe("tool");
  });
  it("propaga permissões e utilidade (limitado)", () => {
    const caps = learnedFromExperiences([rec({ requirements: { permissions: ["repo:read"] }, usefulFor: ["a", "b", "c", "d"] })]);
    expect(caps[0].permissions).toEqual(["repo:read"]);
    expect(caps[0].relatedTo).toHaveLength(3);
  });
});