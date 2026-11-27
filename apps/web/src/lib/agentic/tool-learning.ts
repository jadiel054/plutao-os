/**
 * Aprendizado de ferramentas por documentação e exploração autorizada.
 *
 * Produz conhecimento operacional REUTILIZÁVEL (contratos, parâmetros,
 * erros, autenticação), não apenas nomes no prompt. Probes são somente
 * leitura e dependem de política explícita.
 */

import type { OperationalKnowledge } from "./operational-knowledge";

export type DocEndpoint = {
  method: string;
  path: string;
  auth?: string;
  params?: string[];
  errors?: string[];
};

export type ToolDocumentation = {
  toolName: string;
  endpoints: DocEndpoint[];
  authRequirements: string[];
  examples: string[];
  limitations: string[];
  rawExcerpt: string;
};

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const AUTH_HINTS = [/bearer/i, /api[ -]?key/i, /token/i, /oauth/i, /authorization/i, /basic auth/i];

/** Extração heurística de contratos a partir de documentação oficial/texto. */
export function parseToolDocumentation(toolName: string, text: string): ToolDocumentation {
  const lines = text.split(/\n/);
  const endpoints: DocEndpoint[] = [];
  for (const line of lines) {
    const m = line.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[A-Za-z0-9_\-./{}:]+|https?:\/\/\S+)/);
    if (m) {
      endpoints.push({ method: m[1], path: m[2] });
    }
  }
  const authRequirements: string[] = [];
  for (const line of lines) {
    if (AUTH_HINTS.some((p) => p.test(line)) && line.trim().length < 200) {
      authRequirements.push(line.trim().slice(0, 160));
    }
  }
  const examples = lines
    .filter((l) => /\b(curl |fetch\(|axios|exemplo|example)/i.test(l))
    .map((l) => l.trim().slice(0, 200))
    .slice(0, 8);
  const limitations = lines
    .filter((l) => /\b(rate.?limit|limite|quota|não suport|nao suport|deprecated|obsoleto)/i.test(l))
    .map((l) => l.trim().slice(0, 200))
    .slice(0, 8);
  return {
    toolName,
    endpoints: endpoints.slice(0, 20),
    authRequirements: authRequirements.slice(0, 6),
    examples,
    limitations,
    rawExcerpt: text.slice(0, 4000),
  };
}

export type DocSufficiency = {
  sufficient: boolean;
  reason: string;
};

/** A documentação basta quando cobre contrato + autenticação. */
export function documentationSufficiency(doc: ToolDocumentation): DocSufficiency {
  if (doc.endpoints.length === 0) {
    return { sufficient: false, reason: "nenhum endpoint/contrato identificado na documentação" };
  }
  if (doc.authRequirements.length === 0) {
    return { sufficient: false, reason: "requisitos de autenticação não identificados" };
  }
  return { sufficient: true, reason: "contrato e autenticação identificados" };
}

export type ProbePolicy = {
  /** Somente probes READ são permitidos, sempre. */
  allowProbes: boolean;
  /** Domínios autorizados para probe (allowlist estrita). */
  allowedHosts: string[];
  maxProbes: number;
};

export const READ_ONLY_PROBE_POLICY: ProbePolicy = {
  allowProbes: true,
  allowedHosts: [],
  maxProbes: 3,
};

export type ProbeStep = {
  endpoint: DocEndpoint;
  url: string;
  rationale: string;
};

/**
 * Plano de exploração autorizada: apenas leitura, apenas hosts na allowlist,
 * limite de probes. Nada de credenciais; nada de escrita.
 */
export function buildAuthorizedProbePlan(
  doc: ToolDocumentation,
  baseUrl: string,
  policy: ProbePolicy
): { probes: ProbeStep[]; refused?: string } {
  if (!policy.allowProbes) {
    return { probes: [], refused: "exploração autorizada desabilitada pela política" };
  }
  let host = "";
  try {
    host = new URL(baseUrl).host;
  } catch {
    return { probes: [], refused: "baseUrl inválida" };
  }
  if (!policy.allowedHosts.includes(host)) {
    return { probes: [], refused: "host fora da allowlist de exploração autorizada" };
  }
  const probes = doc.endpoints
    .filter((e) => e.method === "GET")
    .slice(0, policy.maxProbes)
    .map((e) => ({
      endpoint: e,
      url: baseUrl.replace(/\/$/, "") + e.path,
      rationale: "probe somente leitura para confirmar contrato de " + doc.toolName,
    }));
  return { probes };
}

/** Confirma (ou refuta) o conhecimento a partir dos resultados reais dos probes. */
export function assembleKnowledge(
  doc: ToolDocumentation,
  probeResults: Array<{ url: string; ok: boolean; evidence: string }>,
  now: string
): OperationalKnowledge {
  const allOk = probeResults.length > 0 && probeResults.every((p) => p.ok);
  const kind = probeResults.length === 0 ? "hypothesis" : allOk ? "confirmed" : "hypothesis";
  return {
    id: "tool-learning:" + doc.toolName,
    subject: doc.toolName,
    method:
      "Contratos: " +
      doc.endpoints.map((e) => e.method + " " + e.path).join("; ") +
      (doc.authRequirements.length > 0 ? " | auth: " + doc.authRequirements[0] : ""),
    kind,
    observedAt: now,
    requirements: { auth: doc.authRequirements.slice(0, 2) },
    limitations: doc.limitations,
    usefulFor: ["chamadas futuras a " + doc.toolName, "planejamento de missões que usam " + doc.toolName],
    evidence: probeResults.map((p) => (p.ok ? "probe ok " : "probe falhou ") + p.url + " :: " + p.evidence.slice(0, 120)),
  };
}

/**
 * Busca documentação com fetch injetado (testável); nunca envia credenciais.
 */
export async function fetchDocumentation(
  url: string,
  fetcher: (url: string) => Promise<{ ok: boolean; text: string }>
): Promise<{ ok: boolean; text: string }> {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    return { ok: false, text: "URL inválida" };
  }
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".internal")) {
    return { ok: false, text: "host não autorizado para aprendizado de documentação" };
  }
  return fetcher(url);
}
