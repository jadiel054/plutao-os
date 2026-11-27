import { describe, expect, it } from "vitest";
import {
  buildIntake,
  knowledgeFromIntake,
  probePolicyFromEnv,
  redactSecrets,
  runProbes,
} from "../knowledge-intake";

const DOC = [
  "## API Reference",
  "GET /v1/runs lista execuções (requer Authorization: Bearer <token>).",
  "POST /v1/runs cria execução.",
  "Rate limit: 60 requests por minuto.",
  "Exemplo: curl https://api.exemplo.com/v1/runs",
].join("\n");
const POLICY = { allowProbes: true, allowedHosts: ["api.exemplo.com"], maxProbes: 3 };

describe("redactSecrets", () => {
  it("mascara tokens e chaves antes de qualquer persistência", () => {
    const out = redactSecrets("use token: ghp_abcdefghijklmnopqrstvvv e sk-abcdefghijklmnop123456");
    expect(out).not.toContain("ghp_abcdefghijklmnopqrstvvv");
    expect(out).toContain("[redacted]");
  });
});

describe("probePolicyFromEnv", () => {
  it("allowlist vem do ambiente; sem env, probes desabilitados", () => {
    expect(probePolicyFromEnv({}).allowProbes).toBe(false);
    const p = probePolicyFromEnv({ PLUTAO_AGENTIC_PROBE_HOSTS: "api.exemplo.com, api2.exemplo.com" });
    expect(p.allowProbes).toBe(true);
    expect(p.allowedHosts).toEqual(["api.exemplo.com", "api2.exemplo.com"]);
  });
});

describe("buildIntake", () => {
  it("marca documentação sem contrato como insuficiente", () => {
    const r = buildIntake({ toolName: "x", documentationText: "nada aqui", policy: POLICY });
    expect(r.accepted).toBe(true);
    if (!r.accepted) return;
    expect(r.sufficient).toBe(false);
    expect(r.probePlan).toHaveLength(0);
  });
  it("doc suficiente sem baseUrl → hypothesis sem probes", () => {
    const r = buildIntake({ toolName: "ci-api", documentationText: DOC, policy: POLICY });
    if (!r.accepted) throw new Error("deveria aceitar");
    expect(r.sufficient).toBe(true);
    expect(r.probePlan).toHaveLength(0);
    const k = knowledgeFromIntake(r.doc, [], "2026-11-27T12:00:00Z");
    expect(k.subject).toBe("tool-learning:ci-api");
    expect(k.kind).toBe("hypothesis");
  });
  it("host fora da allowlist não gera probes", () => {
    const r = buildIntake({ toolName: "ci-api", documentationText: DOC, baseUrl: "https://evil.com", policy: POLICY });
    if (!r.accepted) throw new Error("deveria aceitar");
    expect(r.probePlan).toHaveLength(0);
    expect(r.probeRefused).toBeTruthy();
  });
  it("host autorizado gera probes GET limitados", () => {
    const r = buildIntake({ toolName: "ci-api", documentationText: DOC, baseUrl: "https://api.exemplo.com", policy: POLICY });
    if (!r.accepted) throw new Error("deveria aceitar");
    expect(r.probePlan.length).toBe(1);
    expect(r.probePlan[0].url).toBe("https://api.exemplo.com/v1/runs");
  });
});

describe("runProbes", () => {
  it("probe bem-sucedido confirma o conhecimento", async () => {
    const results = await runProbes(
      [{ url: "https://api.exemplo.com/v1/runs", rationale: "probe" }],
      async () => ({ ok: true, text: '{"runs":[]}' })
    );
    expect(results[0].ok).toBe(true);
    const r2 = buildIntake({ toolName: "ci-api", documentationText: DOC, policy: POLICY });
    if (!r2.accepted) throw new Error("deveria aceitar");
    const k = knowledgeFromIntake(r2.doc, results, "2026-11-27T12:00:00Z");
    expect(k.kind).toBe("confirmed");
  });
  it("probe com erro não confirma e não lança", async () => {
    const results = await runProbes(
      [{ url: "https://api.exemplo.com/v1/runs", rationale: "probe" }],
      async () => { throw new Error("boom"); }
    );
    expect(results[0].ok).toBe(false);
  });
});