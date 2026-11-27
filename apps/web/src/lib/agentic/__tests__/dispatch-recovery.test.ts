import { describe, expect, it } from "vitest";
import {
  computeKnownFailed,
  IDEMPOTENT_TOOLS,
  rankForRecovery,
  retryDecision,
  shouldAutoRetry,
  TRANSIENT_UNCERTAIN_NOTE,
  summarizeKnownIssues,
  TIMEOUT_UNCERTAIN_NOTE,
} from "../dispatch-recovery";
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
  it("TIMEOUT em tool NÃO idempotente NÃO tem retry automático", () => {
    expect(shouldAutoRetry(classifyObstacle("timeout after 30s"), "github")).toBe(false);
    expect(shouldAutoRetry(classifyObstacle("timeout after 30s"), "process")).toBe(false);
    expect(shouldAutoRetry(classifyObstacle("timeout after 30s"), "supabase")).toBe(false);
  });
  it("TIMEOUT em tool IDEMPOTENTE tem retry automático", () => {
    expect(shouldAutoRetry(classifyObstacle("timeout after 30s"), "files.export_pdf")).toBe(true);
    expect(shouldAutoRetry(classifyObstacle("timeout after 30s"), "files.export_markdown")).toBe(true);
  });
  it("TRANSIENT em tool NÃO idempotente sem idempotency key NÃO tem retry automático", () => {
    expect(shouldAutoRetry(classifyObstacle("ECONNRESET na rede"), "github")).toBe(false);
  });
});

// Bloqueador 1 — retry seguro: resultado incerto verificado antes de repetir.
describe("retryDecision (bloqueador 1)", () => {
  it("timeout DEPOIS de a operação remota produzir efeito: resultado incerto, sem repetição", () => {
    const d2 = retryDecision(classifyObstacle("timeout after 30s"), "github");
    expect(d2.outcome).toBe("uncertain");
    expect(d2.reason).toContain("incerto");
    expect(d2.reason).toContain("verifique o estado");
  });
  it("falha de conexão APÓS o envio da operação: resultado incerto, sem repetição", () => {
    const d2 = retryDecision(classifyObstacle("ECONNRESET na rede"), "supabase");
    expect(d2.outcome).toBe("uncertain");
    expect(d2.reason).toContain(TRANSIENT_UNCERTAIN_NOTE);
  });
  it("operação mutável COM idempotency key: retry seguro (deduplicado)", () => {
    const d2 = retryDecision(classifyObstacle("timeout after 30s"), "github", { hasIdempotencyKey: true });
    expect(d2.outcome).toBe("safe_retry");
    expect(d2.reason).toContain("idempotency key");
  });
  it("operação idempotente: recuperação segura com retry automático", () => {
    const d2 = retryDecision(classifyObstacle("ECONNRESET na rede"), "files.export_pdf");
    expect(d2.outcome).toBe("safe_retry");
  });
  it("operacao mutável sem possibilidade de verificação permanece incerta (nunca reexecutada)", () => {
    for (const err of ["timeout after 30s", "ECONNRESET na rede"]) {
      const d2 = retryDecision(classifyObstacle(err), "process");
      expect(d2.outcome).toBe("uncertain");
      expect(shouldAutoRetry(classifyObstacle(err), "process")).toBe(false);
    }
  });
  it("obstáculo não transitório: sem retry (plano de recuperação assume)", () => {
    const d2 = retryDecision(classifyObstacle("403 forbidden"), "github", { hasIdempotencyKey: true });
    expect(d2.outcome).toBe("no_retry");
  });
  it("sem tool informada (compatibilidade legada): mantém retry para transitórios", () => {
    expect(retryDecision(classifyObstacle("ECONNRESET na rede")).outcome).toBe("safe_retry");
  });
});

describe("IDEMPOTENT_TOOLS e resultado incerto", () => {
  it("lista contém apenas tools com execução idempotente verificada", () => {
    expect(IDEMPOTENT_TOOLS.has("files.export_pdf")).toBe(true);
    expect(IDEMPOTENT_TOOLS.has("github")).toBe(false);
    expect(IDEMPOTENT_TOOLS.has("process")).toBe(false);
  });
  it("TIMEOUT_UNCERTAIN_NOTE comunica resultado incerto", () => {
    expect(TIMEOUT_UNCERTAIN_NOTE).toContain("incerto");
    expect(TIMEOUT_UNCERTAIN_NOTE).toContain("verifique o estado remoto");
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