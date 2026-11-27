/**
 * Aprendizado de ferramentas — integração (API + persistência).
 *
 * Converte documentação (texto) em conhecimento operacional persistido.
 * REGRA DE OURO: aprender NÃO concede autorização — nenhum segredo é
 * armazenado (redação antes de qualquer parse/persistência), probes são GET
 * em hosts de allowlist configurada no SERVIDOR (env), e o conhecimento fica
 * como hypothesis até probe bem-sucedido.
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

/** Allowlist de probes vem do AMBIENTE do servidor, nunca do cliente. */
export function probePolicyFromEnv(
  env: { PLUTAO_AGENTIC_PROBE_HOSTS?: string | string[] | null }
): ProbePolicy {
  const raw = env.PLUTAO_AGENTIC_PROBE_HOSTS;
  const hosts = (Array.isArray(raw) ? raw : String(raw ?? "").split(","))
    .map((h) => h.trim())
    .filter(Boolean);
  return { ...READ_ONLY_PROBE_POLICY, allowProbes: hosts.length > 0, allowedHosts: hosts };
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

/** Executa probes GET (somente leitura) com fetch injetado; nunca envia credenciais. */
export async function runProbes(
  probes: Array<{ url: string; rationale: string }>,
  fetcher: (url: string) => Promise<{ ok: boolean; text: string }>
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (const probe of probes) {
    try {
      const r = await fetcher(probe.url);
      results.push({ url: probe.url, ok: r.ok, evidence: String(r.text ?? "").slice(0, 120) });
    } catch (e) {
      results.push({
        url: probe.url,
        ok: false,
        evidence: e instanceof Error ? e.message : "erro no probe",
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