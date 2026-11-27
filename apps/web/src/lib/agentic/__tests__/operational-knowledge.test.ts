import { describe, expect, it } from "vitest";
import {
  assessKnowledge,
  knowledgeSummary,
  rankAlternatives,
  type OperationalKnowledge,
} from "../operational-knowledge";

const now = "2026-11-26T12:00:00Z";

const base: OperationalKnowledge = {
  id: "exp1",
  subject: "github.prs.get",
  method: "usar capability github.prs.get com owner/repo/number",
  kind: "succeeded_experience",
  observedAt: "2026-11-20T12:00:00Z",
};

describe("assessKnowledge", () => {
  it("aplica conhecimento sem restrições", () => {
    expect(assessKnowledge(base, { now })).toBe("applicable");
  });

  it("expira conhecimento com validade vencida", () => {
    const k = { ...base, validUntil: "2026-11-21T00:00:00Z" };
    expect(assessKnowledge(k, { now })).toBe("stale");
  });

  it("invalida por versão e ambiente", () => {
    const k = { ...base, requirements: { toolVersion: "v1" } };
    expect(assessKnowledge(k, { now, toolVersion: "v2" })).toBe("incompatible");
    const k2 = { ...base, requirements: { environment: "computer" } };
    expect(assessKnowledge(k2, { now, environment: "connector" })).toBe("incompatible");
  });

  it("exige permissões declaradas", () => {
    const k = { ...base, requirements: { permissions: ["repo:admin"] } };
    expect(assessKnowledge(k, { now, permissions: [] })).toBe("missing_permission");
    expect(assessKnowledge(k, { now, permissions: ["repo:admin"] })).toBe("applicable");
  });
});

describe("rankAlternatives", () => {
  const alts = [
    { id: "github.prs.get", subject: "github.prs.get" },
    { id: "github.issues_get", subject: "github.issues_get" },
    { id: "github.actions_list", subject: "github.actions_list" },
  ];
  const failed: OperationalKnowledge = {
    ...base,
    id: "exp2",
    subject: "github.actions_list",
    kind: "failed_method",
  };
  it("rebaixa método que falhou e promove experiência bem-sucedida", () => {
    const ranked = rankAlternatives(alts, [base, failed], { now });
    expect(ranked[0].item.id).toBe("github.prs.get");
    const last = ranked[ranked.length - 1];
    expect(last.item.id).toBe("github.actions_list");
    expect(last.score).toBeLessThan(0);
  });
  it("experiência obsoleta não influencia", () => {
    const stale: OperationalKnowledge = { ...base, validUntil: "2026-11-01T00:00:00Z" };
    const ranked = rankAlternatives(alts, [stale], { now });
    expect(ranked.every((r) => r.score === 0)).toBe(true);
  });
});

describe("knowledgeSummary", () => {
  it("nunca afirma além do registro", () => {
    const s = knowledgeSummary({ ...base, kind: "hypothesis", limitations: ["somente leitura"] });
    expect(s).toContain("hipótese");
    expect(s).toContain("somente leitura");
  });
});
