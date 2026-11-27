/**
 * Aprendizado de ferramentas — integração (API + persistência).
 *
 * Converte documentação (texto) em conhecimento operacional persistido.
 * REGRA DE OURO: aprender NÃO concede autorização — nenhum segredo é
 * armazenado (redação antes de qualquer parse/persistência), probes são GET
 * em hosts de allowlist configurada no SERVIDOR (env), sem seguir redirects
 * não revalidados, e o conhecimento fica como hypothesis até probe
 * bem-sucedido.
 */

import {
  assembleKnowledge,
  buildAuthorizedProbePlan,
  documentationSufficiency,
  parseToolDocumentation,
  READ_ONLY_PROBE_POLICY,
  type ProbePolicy,
  type ToolDocumentation,
} from "./tool-learning";

/** Padrões de segredos: nunca persistir credenciais no conhecimento. */
const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk-[A-Za-z0-9_\-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[bap]-[A-Za-z0-9\-]{10,}|AKIA[0-9A-Z]{16})/g,
  /\b(?:api[_-]?key|token|secret|password|passwd|authorization|bearer)\b\s*[:=]\s*\S+/gi,
];

export function redactSecrets(text: string): string {
  let out = String(text ?? "");
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, "[redacted]");
  return out;
}

/**
 * Allowlist de probes vem do AMBIENTE do servidor, nunca do cliente.
 * A assinatura aceita ProcessEnv (index signature) e objetos literais,
 * evitando o erro de "weak type" do TypeScript no chamador.
 */
export function probePolicyFromEnv(
  env: Record<string, string | string[] | undefined | null>
): ProbePolicy {
  const raw = env.PLUTAO_AGENTIC_PROBE_HOSTS;
  const hosts = (Array.isArray(raw) ? raw : String(raw ?? "").split(","))
    .map((h) => h.trim())
    .filter(Boolean);
  return { ...READ_ONLY_PROBE_POLICY, allowProbes: hosts.length > 0, allowedHosts: hosts };
}

/**
 * Segurança SSRF: bloqueia hosts locais, privados, loopback, link-local e
 * metadata (IPv4 e IPv6, incluindo mapeados ::ffff:).
 */
const BLOCKED_IPV4_PATTERNS: RegExp[] = [
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^192\.0\.0\./,
  /^198\.1[89]\./,
];

export function isBlockedProbeHost(hostname: string): boolean {
  const h = String(hostname ?? "").toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.includes(":")) {
    const v6 = h.replace(/^\[/, "").replace(/\]$/, "");
    if (v6 === "::1" || v6 === "::") return true;
    if (v6.startsWith("fc") || v6.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(v6)) return true;
    if (v6.startsWith("::ffff:")) return isBlockedProbeHost(v6.slice(7));
    return false;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    return BLOCKED_IPV4_PATTERNS.some((p) => p.test(h));
  }
  return false;
}

export type ProbeUrlValidation = { ok: true } | { ok: false; reason: string };

/**
 * Valida uma URL de probe: protocolo http/https, host na allowlist,
 * host não bloqueado e (opcionalmente) resolução DNS sem IP privado/local.
 */
export async function validateProbeUrl(
  url: string,
  allowedHosts: string[],
  resolveDns?: (hostname: string) => Promise<string[]>
): Promise<ProbeUrlValidation> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "URL inválida" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "protocolo não permitido: " + parsed.protocol };
  }
  const host = parsed.hostname.toLowerCase();
  if (isBlockedProbeHost(host)) {
    return { ok: false, reason: "host bloqueado (local/privado/loopback/metadata): " + host };
  }
  if (!allowedHosts.includes(host)) {
    return { ok: false, reason: "host fora da allowlist: " + host };
  }
  if (resolveDns) {
    try {
      const addrs = await resolveDns(host);
      if (!addrs.length) return { ok: false, reason: "DNS sem endereços: " + host };
      for (const addr of addrs) {
        if (isBlockedProbeHost(addr)) {
          return { ok: false, reason: "DNS resolve para IP privado/local: " + addr };
        }
      }
    } catch (e) {
      return { ok: false, reason: "falha na resolução DNS: " + (e instanceof Error ? e.message : "erro") };
    }
  }
  return { ok: true };
}

export type SafeProbeResult = { ok: boolean; text?: string; error?: string; finalUrl?: string };
type SafeProbeResponse = {
  ok: boolean;
  status?: number;
  headers?: { get(name: string): string | null };
  text?: () => Promise<string>;
};

/**
 * Probe seguro: valida a URL e CADA destino de redirect (fetch com
 * redirect manual; redirects para hosts não revalidáveis são rejeitados),
 * com timeout e limite de tamanho da resposta. O texto retornado é
 * truncado; a evidência final passa por redactSecrets em runProbes.
 */
export async function safeProbeFetch(
  url: string,
  opts: {
    allowedHosts: string[];
    resolveDns?: (hostname: string) => Promise<string[]>;
    fetchImpl?: (url: string, init?: { redirect?: "manual"; signal?: AbortSignal }) => Promise<SafeProbeResponse>;
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
  }
): Promise<SafeProbeResult> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxBytes = opts.maxBytes ?? 200000;
  const maxRedirects = opts.maxRedirects ?? 3;
  const fetchImpl = opts.fetchImpl;
  if (!fetchImpl) return { ok: false, error: "fetch não configurado" };
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const v = await validateProbeUrl(current, opts.allowedHosts, opts.resolveDns);
    if (!v.ok) return { ok: false, error: "probe recusado: " + v.reason };
    let res: SafeProbeResponse;
    try {
      res = await fetchImpl(current, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "erro no probe" };
    }
    const status = res.status ?? (res.ok ? 200 : 0);
    if (status >= 300 && status < 400) {
      const loc = res.headers?.get("location");
      if (!loc) return { ok: false, error: "redirect sem Location" };
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        return { ok: false, error: "Location de redirect inválido" };
      }
      current = next.toString();
      continue;
    }
    const lenHeader = res.headers?.get("content-length");
    if (lenHeader && Number(lenHeader) > maxBytes) {
      return { ok: false, error: "resposta excessiva (content-length " + lenHeader + " bytes)" };
    }
    let text = "";
    try {
      text = res.text ? await res.text() : "";
    } catch {
      return { ok: false, error: "falha ao ler a resposta do probe" };
    }
    if (text.length > maxBytes) {
      return { ok: false, error: "resposta excessiva (" + text.length + " bytes)" };
    }
    return { ok: !!res.ok, text: text.slice(0, 2000), finalUrl: current };
  }
  return { ok: false, error: "excesso de redirects" };
}

export type IntakeResult =
  | {
      accepted: true;
      doc: ToolDocumentation;
      sufficient: boolean;
      sufficiencyReason: string;
      probePlan: Array<{ url: string; rationale: string }>;
      probeRefused?: string;
    }
  | { accepted: false; reason: string };

/** Documentação → contrato parseado + plano de probe autorizado (se houver). */
export function buildIntake(input: {
  toolName: string;
  documentationText: string;
  baseUrl?: string;
  policy: ProbePolicy;
}): IntakeResult {
  const name = input.toolName.trim().slice(0, 80);
  if (!name) return { accepted: false, reason: "toolName obrigatório" };
  const text = redactSecrets(input.documentationText ?? "");
  if (!text.trim()) return { accepted: false, reason: "documentação vazia" };
  const doc = parseToolDocumentation(name, text);
  const suff = documentationSufficiency(doc);
  if (!suff.sufficient) {
    return { accepted: true, doc, sufficient: false, sufficiencyReason: suff.reason, probePlan: [] };
  }
  if (input.baseUrl) {
    const plan = buildAuthorizedProbePlan(doc, input.baseUrl, input.policy);
    return {
      accepted: true,
      doc,
      sufficient: true,
      sufficiencyReason: suff.reason,
      probePlan: plan.probes,
      probeRefused: plan.refused,
    };
  }
  return { accepted: true, doc, sufficient: true, sufficiencyReason: suff.reason, probePlan: [] };
}

export type ProbeResult = { url: string; ok: boolean; evidence: string };

/** Executa probes GET (somente leitura) com fetch injetado; nunca envia credenciais. Evidência sempre com segredos redigidos. */
export async function runProbes(
  probes: Array<{ url: string; rationale: string }>,
  fetcher: (url: string) => Promise<{ ok: boolean; text: string }>
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (const probe of probes) {
    try {
      const r = await fetcher(probe.url);
      results.push({ url: probe.url, ok: r.ok, evidence: redactSecrets(String(r.text ?? "").slice(0, 120)) });
    } catch (e) {
      results.push({
        url: probe.url,
        ok: false,
        evidence: redactSecrets(e instanceof Error ? e.message : "erro no probe"),
      });
    }
  }
  return results;
}

/** Conhecimento final a persistir (sempre com subject prefixado tool-learning:). */
export function knowledgeFromIntake(
  doc: ToolDocumentation,
  probeResults: ProbeResult[],
  now: string
) {
  const knowledge = assembleKnowledge(doc, probeResults, now);
  return {
    subject: "tool-learning:" + doc.toolName,
    kind: knowledge.kind,
    method: knowledge.method,
    limitations: knowledge.limitations,
    usefulFor: knowledge.usefulFor,
    requirements: knowledge.requirements,
    evidence: knowledge.evidence,
  };
}