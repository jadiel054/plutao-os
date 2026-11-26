import { describe, expect, it } from "vitest";
import {
  assembleKnowledge,
  buildAuthorizedProbePlan,
  documentationSufficiency,
  parseToolDocumentation,
  READ_ONLY_PROBE_POLICY,
} from "../tool-learning";

const DOC = [
  "## API Reference",
  "GET /v1/runs lista execuções (requer Authorization: Bearer <token>).",
  "POST /v1/runs cria execução.",
  "Rate limit: 60 requests por minuto.",
  "Exemplo: curl https://api.exemplo.com/v1/runs",
].join("\n");

describe("parseToolDocumentation", () => {
  it("extrai contratos, auth e limitações", () => {
    const doc = parseToolDocumentation("ci-api", DOC);
    expect(doc.endpoints).toHaveLength(2);
    expect(doc.endpoints[0]).toMatchObject({ method: "GET", path: "/v1/runs" });
    expect(doc.authRequirements.length).toBeGreaterThan(0);
    expect(doc.limitations.join(" ")).toMatch(/rate.?limit/i);
  });
});

describe("documentationSufficiency", () => {
  it("exige contrato e autenticação", () => {
    const doc = parseToolDocumentation("ci-api", DOC);
    expect(documentationSufficiency(doc).sufficient).toBe(true);
    const partial = parseToolDocumentation("ci-api", "GET /v1/runs");
    expect(documentationSufficiency(partial).sufficient).toBe(false);
  });
});

describe("buildAuthorizedProbePlan", () => {
  const policy = { ...READ_ONLY_PROBE_POLICY, allowedHosts: ["api.exemplo.com"] };
  it("gera apenas probes GET em hosts autorizados", () => {
    const doc = parseToolDocumentation("ci-api", DOC);
    const plan = buildAuthorizedProbePlan(doc, "https://api.exemplo.com", policy);
    expect(plan.probes.length).toBe(1);
    expect(plan.probes[0].endpoint.method).toBe("GET");
    expect(plan.probes[0].url).toBe("https://api.exemplo.com/v1/runs");
  });
  it("recusa host fora da allowlist", () => {
    const doc = parseToolDocumentation("ci-api", DOC);
    const plan = buildAuthorizedProbePlan(doc, "https://evil.com", policy);
    expect(plan.probes).toHaveLength(0);
    expect(plan.refused).toBeTruthy();
  });
});

describe("assembleKnowledge", () => {
  it("só confirma com probe bem-sucedido", () => {
    const doc = parseToolDocumentation("ci-api", DOC);
    const now = "2026-11-26T12:00:00Z";
    expect(assembleKnowledge(doc, [], now).kind).toBe("hypothesis");
    const ok = assembleKnowledge(doc, [{ url: "https://api.exemplo.com/v1/runs", ok: true, evidence: "200" }], now);
    expect(ok.kind).toBe("confirmed");
    expect(ok.evidence?.[0]).toContain("probe ok");
    const bad = assembleKnowledge(doc, [{ url: "x", ok: false, evidence: "403" }], now);
    expect(bad.kind).toBe("hypothesis");
  });
});
