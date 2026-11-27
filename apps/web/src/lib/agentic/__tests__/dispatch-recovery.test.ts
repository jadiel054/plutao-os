import { describe, expect, it } from "vitest";
import { computeKnownFailed, rankForRecovery, shouldAutoRetry, summarizeKnownIssues } from "../dispatch-recovery";
import { classifyObstacle } from "../obstacle-recovery";
import type { OperationalKnowledge } from "../operational-knowledge";

const now = "2026-11-27T12:00:00Z";
const exp = (over: Partial<OperationalKnowledge>): OperationalKnowledge => ({
  id: "e1", subject: "x.y", method: "m", kind: "failed_method", observedAt: now, ...over,
});

describe("shouldAutoRetry", () => {
  it("retenta apenas obstáculos transitórios", () => {
    expect(shouldAutoRetry(classifyObstacle("timeout after 30s"))).toBe(true);
    expect(shouldAutoRetry(classifyObstacle("ECONNRESET na rede"))).toBe(true);
    expect(shouldAutoRetry(classifyObstacle("403 forbidden"))).toBe(false);
    expect(shouldAutoRetry(classifyObstacle("429 rate limit"))).toBe(false);
    expect(shouldAutoRetry(classifyObstacle("422 invalid input"))).toBe(false);
  });
});

describe("computeKnownFailed", () => {
  it("inclui o método que falhou e as falhas registradas de outros assuntos", () => {
    const known = computeKnownFailed("github.issues_list", [
      exp({ subject: "github.prs.get" }),
      exp({ subject: "github.issues_list", kind: "succeeded_experience" }),
    ]);
    expect(known).toContain("github.issues_list");
    expect(known).toContain("github.prs.get");
  });
  it("ignora experiências que não são falhas", () => {
    const known = computeKnownFailed("t", [exp({ subject: "a.b", kind: "confirmed" })]);
    expect(known).toEqual(["t"]);
  });
});

describe("rankForRecovery", () => {
  const alts = [
    { id: "a.risky", subject: "a.risky", mode: "read" as const, instruction: "" },
    { id: "a.proven", subject: "a.proven", mode: "read" as const, instruction: "" },
  ];
  it("promove alternativa com experiência bem-sucedida", () => {
    const ranked = rankForRecovery(alts, [exp({ subject: "a.proven", kind: "succeeded_experience" })]);
    expect(ranked[0].id).toBe("a.proven");
  });
  it("rebaixa alternativa que já falhou", () => {
    const ranked = rankForRecovery(alts, [exp({ subject: "a.risky" })]);
    expect(ranked[ranked.length - 1].id).toBe("a.risky");
  });
});

describe("summarizeKnownIssues", () => {
  it("resume falhas com causa, sem incluir sucessos", () => {
    const issues = summarizeKnownIssues([
      exp({ subject: "a.b", cause: "500 indisponível" }),
      exp({ subject: "c.d", kind: "succeeded_experience" }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("a.b");
    expect(issues[0]).toContain("500 indisponível");
  });
});