import { describe, expect, it } from "vitest";
import {
  buildIntake,
  isBlockedProbeHost,
  knowledgeFromIntake,
  probePolicyFromEnv,
  redactSecrets,
  runProbes,
  safeProbeFetch,
  validateProbeUrl,
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
  it("aceita ProcessEnv do Node (correção de tipagem do build)", () => {
    const envLike: Record<string, string | string[] | undefined | null> = { PLUTAO_AGENTIC_PROBE_HOSTS: "api.exemplo.com" };
    expect(probePolicyFromEnv(envLike).allowedHosts).toEqual(["api.exemplo.com"]);
  });
});

describe("isBlockedProbeHost (SSRF)", () => {
  it("bloqueia loopback, privado, link-local, metadata e local (IPv4 e IPv6)", () => {
    for (const h of [
      "localhost", "api.local", "svc.internal",
      "127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.9", "172.31.255.1",
      "169.254.169.254", "100.64.0.1", "0.0.0.0",
      "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254",
    ]) {
      expect(isBlockedProbeHost(h)).toBe(true);
    }
  });
  it("não bloqueia hosts públicos", () => {
    expect(isBlockedProbeHost("api.exemplo.com")).toBe(false);
    expect(isBlockedProbeHost("2606:4700::1111")).toBe(false);
  });
});

describe("validateProbeUrl", () => {
  it("aceita host da allowlist", async () => {
    const r = await validateProbeUrl("https://api.exemplo.com/v1/runs", ["api.exemplo.com"]);
    expect(r.ok).toBe(true);
  });
  it("recusa host fora da allowlist", async () => {
    const r = await validateProbeUrl("https://evil.com/x", ["api.exemplo.com"]);
    expect(r.ok).toBe(false);
  });
  it("recusa host bloqueado mesmo se allowlist contivesse", async () => {
    const r = await validateProbeUrl("http://169.254.169.254/latest/meta-data", ["169.254.169.254"]);
    expect(r.ok).toBe(false);
  });
  it("recusa quando o DNS do domínio permitido resolve para IP privado", async () => {
    const r = await validateProbeUrl("https://api.exemplo.com/v1", ["api.exemplo.com"], async () => ["10.0.0.7"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("privado");
  });
  it("aceita quando o DNS resolve para IP público", async () => {
    const r = await validateProbeUrl("https://api.exemplo.com/v1", ["api.exemplo.com"], async () => ["93.184.216.34"]);
    expect(r.ok).toBe(true);
  });
});

describe("safeProbeFetch", () => {
  const okRes = (text: string, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => (n.toLowerCase() === "content-length" ? null : null) },
    text: async () => text,
  });

  it("probe direto permitido retorna texto truncado", async () => {
    const r = await safeProbeFetch("https://api.exemplo.com/v1/runs", {
      allowedHosts: ["api.exemplo.com"],
      fetchImpl: async () => okRes('{"runs":[]}'),
    });
    expect(r.ok).toBe(true);
    expect(r.text).toBe('{"runs":[]}');
  });
  it("redirect malicioso para IP de metadata é RECUSADO", async () => {
    const r = await safeProbeFetch("https://api.exemplo.com/v1/runs", {
      allowedHosts: ["api.exemplo.com"],
      fetchImpl: async () => ({
        ok: false, status: 302,
        headers: { get: (n: string) => (n.toLowerCase() === "location" ? "http://169.254.169.254/latest/meta-data/" : null) },
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("bloqueado");
  });
  it("redirect para host FORA da allowlist é recusado", async () => {
    const r = await safeProbeFetch("https://api.exemplo.com/v1/runs", {
      allowedHosts: ["api.exemplo.com"],
      fetchImpl: async () => ({
        ok: false, status: 302,
        headers: { get: (n: string) => (n.toLowerCase() === "location" ? "https://evil.com/steal" : null) },
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("allowlist");
  });
  it("redirect revalidado para host permitido é seguido", async () => {
    let calls = 0;
    const r = await safeProbeFetch("https://api.exemplo.com/a", {
      allowedHosts: ["api.exemplo.com"],
      fetchImpl: async () => {
        calls++;
        if (calls === 1) {
          return { ok: false, status: 302, headers: { get: (n: string) => (n.toLowerCase() === "location" ? "/v1/runs" : null) } };
        }
        return okRes("fim");
      },
    });
    expect(r.ok).toBe(true);
    expect(r.finalUrl).toBe("https://api.exemplo.com/v1/runs");
  });
  it("DNS do host permitido apontando para IP privado recusa o probe", async () => {
    const r = await safeProbeFetch("https://api.exemplo.com/v1/runs", {
      allowedHosts: ["api.exemplo.com"],
      resolveDns: async () => ["192.168.0.10"],
      fetchImpl: async () => okRes("nunca"),
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("privado");
  });
  it("resposta excessiva (content-length) é recusada", async () => {
    const r = await safeProbeFetch("https://api.exemplo.com/grande", {
      allowedHosts: ["api.exemplo.com"],
      maxBytes: 100,
      fetchImpl: async () => ({
        ok: true, status: 200,
        headers: { get: (n: string) => (n.toLowerCase() === "content-length" ? "999999" : null) },
        text: async () => "x",
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("excessiva");
  });
  it("resposta excessiva (corpo maior que o limite) é recusada", async () => {
    const r = await safeProbeFetch("https://api.exemplo.com/grande", {
      allowedHosts: ["api.exemplo.com"],
      maxBytes: 10,
      fetchImpl: async () => okRes("a".repeat(50)),
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("excessiva");
  });
  it("timeout do fetch aparece como erro (sem retry interno)", async () => {
    const r = await safeProbeFetch("https://api.exemplo.com/lento", {
      allowedHosts: ["api.exemplo.com"],
      fetchImpl: async () => { throw new Error("The operation was aborted due to timeout"); },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("aborted");
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
  it("evidência com segredos é REDIGIDA antes de persistir/retornar", async () => {
    const results = await runProbes(
      [{ url: "https://api.exemplo.com/v1/runs", rationale: "probe" }],
      async () => ({ ok: true, text: "authorization: Bearer abc123 e token: ghp_abcdefghijklmnopqrstvvv" })
    );
    expect(results[0].evidence).not.toContain("ghp_abcdefghijklmnopqrstvvv");
    expect(results[0].evidence).not.toContain("Bearer abc123");
    expect(results[0].evidence).toContain("[redacted]");
  });
});