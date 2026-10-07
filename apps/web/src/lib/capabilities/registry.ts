/**
 * H9 — Registro único e tipado de capacidades.
 *
 * Fonte de verdade de QUAIS capacidades existem, se estão habilitadas e QUAIS
 * controles de segurança cada uma exige. O dispatcher/executores consultam este
 * registro ANTES de executar: capacidade ausente, desabilitada ou com controle
 * não implementado é RECUSADA (fail-closed).
 *
 * `docs/CAPABILITIES.md` é gerado a partir daqui — não editar o doc à mão.
 * Regenerar com: `npx tsx scripts/generate-capabilities-doc.ts`
 */

import type { ConnectorProviderId } from "@plutao/domain";
import { CONNECTOR_MANIFESTS } from "@/lib/connectors/manifests";

/** Controles de segurança que podem ser exigidos por uma capacidade. */
export type CapabilityControl =
  | "capability_allowlist"
  | "input_sanitization"
  | "output_sanitization"
  | "write_gate"
  | "gate_server_validation"
  | "rate_limit"
  | "audit_trail"
  | "sandbox_isolation"
  | "path_validation"
  | "dod_evidence";

export const CONTROL_DESCRIPTIONS: Record<CapabilityControl, string> = {
  capability_allowlist:
    "A capacidade precisa existir no registro e estar habilitada; ausência de manifesto/allowlist é recusa.",
  input_sanitization:
    "Entrada do usuário/modelo é validada e sanitizada antes de virar parâmetro de execução.",
  output_sanitization:
    "Saída e mensagens de erro passam pelo sanitizador central (`lib/security/sanitize.ts`).",
  write_gate:
    "Efeito colateral real exige write_gate aprovado por humano (Princípio 1).",
  gate_server_validation:
    "O gate é validado no servidor: id + usuário + status approved + hash do payload + uso único atômico.",
  rate_limit: "Chamadas são limitadas por janela deslizante por usuário/grant.",
  audit_trail: "Toda execução gera evidência auditável (audit_events / mission evidence).",
  sandbox_isolation: "Operações de arquivo ficam confinadas ao namespace do usuário/missão.",
  path_validation: "Caminhos são validados contra traversal, absolutos e escape por symlink.",
  dod_evidence: "Conclusão de missão exige evidência verificável (Definition of Done).",
};

/**
 * Controles atualmente IMPLEMENTADOS no código.
 *
 * Mutável de propósito: testes removem um controle daqui para provar que a
 * capacidade correspondente é bloqueada (fail-closed), sem precisar quebrar
 * código de produção.
 */
export const IMPLEMENTED_CONTROLS = new Set<CapabilityControl>([
  "capability_allowlist",
  "input_sanitization",
  "output_sanitization",
  "write_gate",
  "gate_server_validation",
  "rate_limit",
  "audit_trail",
  "sandbox_isolation",
  "path_validation",
  "dod_evidence",
]);

export type CapabilityEntry = {
  /** Identificador estável: `<provider>.<capability>`. */
  id: string;
  provider: ConnectorProviderId;
  capability: string;
  mode: "read" | "write";
  enabled: boolean;
  requiredControls: CapabilityControl[];
  /** Onde o controle é comprovado (arquivo:linha ou teste). */
  evidence: string[];
  notes?: string;
};

type Declaration = {
  capability: string;
  mode: "read" | "write";
  enabled?: boolean;
  controls?: CapabilityControl[];
  evidence?: string[];
  notes?: string;
};

const READ_DEFAULTS: CapabilityControl[] = [
  "capability_allowlist",
  "output_sanitization",
  "audit_trail",
];

const WRITE_DEFAULTS: CapabilityControl[] = [
  "capability_allowlist",
  "input_sanitization",
  "output_sanitization",
  "write_gate",
  "gate_server_validation",
  "rate_limit",
  "audit_trail",
];

const READ_EVIDENCE = ["lib/connectors/runRestCapability.ts", "lib/mcp/audit.ts"];
const WRITE_EVIDENCE = [
  "lib/connectors/gates.ts#consumeGateForWrite",
  "lib/connectors/gatePayload.ts",
  "app/api/gates/[id]/route.ts",
];

/**
 * Declarações por provedor. Toda capability presente em um manifesto PRECISA
 * ter declaração aqui — `assertRegistryCoverage()` falha o build/teste se
 * houver divergência (evita registro que mente sobre a realidade).
 */
const DECLARATIONS: Record<ConnectorProviderId, Declaration[]> = {
  github: [
    { capability: "repos_list", mode: "read" },
    { capability: "repo_get", mode: "read" },
    { capability: "issues_list", mode: "read" },
    { capability: "issues_get", mode: "read" },
    { capability: "pulls_list", mode: "read" },
    { capability: "actions_list", mode: "read" },
    {
      capability: "repo_create",
      mode: "write",
      notes: "Cria repositório real na conta do usuário.",
    },
    {
      capability: "push_files",
      mode: "write",
      notes: "Commit de até 20 arquivos / 100KB por arquivo.",
    },
    { capability: "github.files.write", mode: "write" },
    { capability: "github.branches.list", mode: "read" },
    { capability: "github.branches.create", mode: "write" },
    { capability: "github.prs.create", mode: "write" },
    { capability: "github.prs.list", mode: "read" },
    { capability: "github.prs.get", mode: "read" },
    { capability: "github.code.search", mode: "read" },
    { capability: "github.tree", mode: "read" },
  ],
  vercel: [
    { capability: "projects_list", mode: "read" },
    { capability: "deployments_list", mode: "read" },
    { capability: "deployment_get", mode: "read" },
    { capability: "project_create", mode: "write" },
    { capability: "deploy_create", mode: "write" },
  ],
  neon: [
    { capability: "projects_list", mode: "read" },
    { capability: "branches_list", mode: "read" },
    { capability: "databases_list", mode: "read" },
  ],
  stripe: [
    { capability: "balance_get", mode: "read" },
    { capability: "products_list", mode: "read" },
    { capability: "customers_list", mode: "read" },
    { capability: "charges_list", mode: "read" },
    { capability: "subscriptions_list", mode: "read" },
  ],
  supabase: [
    { capability: "projects_list", mode: "read" },
    { capability: "tables_list", mode: "read" },
    {
      capability: "table_read",
      mode: "read",
      controls: [...READ_DEFAULTS, "input_sanitization"],
      evidence: ["lib/connectors/supabaseFilters.ts"],
      notes: "Filtros estruturados e parametrizados; `where` livre é rejeitado.",
    },
    {
      capability: "sql_exec",
      mode: "write",
      notes: "SQL arbitrário; blocklist de DDL destrutivo + gate humano.",
    },
  ],
  telegram: [
    {
      capability: "send_message",
      mode: "write",
      controls: [...WRITE_DEFAULTS, "input_sanitization"],
      evidence: [
        "lib/runtime/tools/telegram.ts#runTelegram",
        "lib/connectors/manifests/telegram.ts",
      ],
      notes:
        "Mensagem outbound é efeito colateral real: classificada como WRITE e sujeita a gate, apesar do manifesto legado marcar mode=read.",
    },
    { capability: "get_updates", mode: "read" },
    { capability: "get_me", mode: "read" },
  ],
  cloudflare: [
    { capability: "zones_list", mode: "read" },
    { capability: "dns_records_list", mode: "read" },
    { capability: "pages_projects_list", mode: "read" },
    { capability: "workers_list", mode: "read" },
    { capability: "dns_record_create", mode: "write" },
    { capability: "pages_deploy", mode: "write" },
  ],
  render: [
    { capability: "services_list", mode: "read" },
    { capability: "service_get", mode: "read" },
    { capability: "deploys_list", mode: "read" },
    { capability: "deploy_trigger", mode: "write" },
    { capability: "env_set", mode: "write", notes: "Valor nunca é exposto em trace/preview." },
  ],
};

function buildEntry(provider: ConnectorProviderId, decl: Declaration): CapabilityEntry {
  const defaults = decl.mode === "write" ? WRITE_DEFAULTS : READ_DEFAULTS;
  const evidenceDefaults = decl.mode === "write" ? WRITE_EVIDENCE : READ_EVIDENCE;
  return {
    id: `${provider}.${decl.capability}`,
    provider,
    capability: decl.capability,
    mode: decl.mode,
    enabled: decl.enabled !== false,
    requiredControls: decl.controls ?? defaults,
    evidence: decl.evidence ?? evidenceDefaults,
    notes: decl.notes,
  };
}

let cachedRegistry: CapabilityEntry[] | null = null;

/** Registro completo (todas as capacidades declaradas, habilitadas ou não). */
export function getCapabilityRegistry(): CapabilityEntry[] {
  if (cachedRegistry) return cachedRegistry;
  const entries: CapabilityEntry[] = [];
  for (const [provider, decls] of Object.entries(DECLARATIONS)) {
    for (const decl of decls) {
      entries.push(buildEntry(provider as ConnectorProviderId, decl));
    }
  }
  cachedRegistry = entries;
  return entries;
}

/** Só o que está habilitado e com todos os controles implementados. */
export function getEnabledCapabilities(): CapabilityEntry[] {
  return getCapabilityRegistry().filter((e) => e.enabled && hasAllControls(e));
}

export function findCapabilityEntry(
  provider: string,
  capability: string
): CapabilityEntry | null {
  return (
    getCapabilityRegistry().find(
      (e) => e.provider === provider && e.capability === capability
    ) ?? null
  );
}

export function hasAllControls(entry: CapabilityEntry): boolean {
  return entry.requiredControls.every((c) => IMPLEMENTED_CONTROLS.has(c));
}

export type CapabilityDecision =
  | { allowed: true; entry: CapabilityEntry }
  | {
      allowed: false;
      reason: "NOT_REGISTERED" | "DISABLED" | "MISSING_CONTROL";
      control?: CapabilityControl;
      message: string;
    };

/**
 * Decide se uma capacidade pode executar AGORA.
 * Fail-closed: qualquer dúvida (não registrada, desabilitada, controle ausente) → recusa.
 */
export function evaluateCapability(provider: string, capability: string): CapabilityDecision {
  const entry = findCapabilityEntry(provider, capability);
  if (!entry) {
    return {
      allowed: false,
      reason: "NOT_REGISTERED",
      message: `Capacidade '${provider}.${capability}' não está registrada. Execução recusada (fail-closed).`,
    };
  }
  if (!entry.enabled) {
    return {
      allowed: false,
      reason: "DISABLED",
      message: `Capacidade '${entry.id}' está desabilitada no registro de capacidades.`,
    };
  }
  const missing = entry.requiredControls.find((c) => !IMPLEMENTED_CONTROLS.has(c));
  if (missing) {
    return {
      allowed: false,
      reason: "MISSING_CONTROL",
      control: missing,
      message: `Capacidade '${entry.id}' exige o controle '${missing}', que não está implementado. Execução recusada.`,
    };
  }
  return { allowed: true, entry };
}

/** Conveniência para os executores: retorna mensagem de erro ou null se liberado. */
export function capabilityBlockReason(provider: string, capability: string): string | null {
  const decision = evaluateCapability(provider, capability);
  return decision.allowed ? null : decision.message;
}

/**
 * Guarda de cobertura: todo capability de manifesto precisa estar declarado, e
 * todo declarado precisa existir no manifesto. Lança em divergência.
 */
export function assertRegistryCoverage(): void {
  const problems: string[] = [];
  const declared = new Set(getCapabilityRegistry().map((e) => e.id));

  for (const manifest of Object.values(CONNECTOR_MANIFESTS)) {
    for (const cap of manifest.capabilities) {
      const id = `${manifest.provider}.${cap.name}`;
      if (!declared.has(id)) {
        problems.push(`manifesto tem '${id}' sem declaração no registro`);
      }
    }
  }

  const manifestIds = new Set(
    Object.values(CONNECTOR_MANIFESTS).flatMap((m) =>
      m.capabilities.map((c) => `${m.provider}.${c.name}`)
    )
  );
  for (const entry of getCapabilityRegistry()) {
    if (!manifestIds.has(entry.id)) {
      problems.push(`registro tem '${entry.id}' que não existe em nenhum manifesto`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Registro de capacidades divergente do manifesto:\n- ${problems.join("\n- ")}`);
  }
}

/**
 * H9 — Controles exigidos pelas tools INTERNAS (não-conector).
 * Ficam fora de `CONNECTOR_MANIFESTS` para não quebrar a checagem de cobertura,
 * mas passam pela mesma avaliação fail-closed no dispatcher.
 */
export const INTERNAL_TOOL_CONTROLS: Record<string, CapabilityControl[]> = {
  note: ["capability_allowlist", "output_sanitization"],
  filesystem: [
    "capability_allowlist",
    "input_sanitization",
    "output_sanitization",
    "sandbox_isolation",
    "path_validation",
    "audit_trail",
  ],
  "files.export_pdf": ["capability_allowlist", "output_sanitization", "sandbox_isolation"],
  "files.export_xlsx": ["capability_allowlist", "output_sanitization", "sandbox_isolation"],
  "files.export_markdown": ["capability_allowlist", "output_sanitization", "sandbox_isolation"],
  "files.export_html": [
    "capability_allowlist",
    "output_sanitization",
    "input_sanitization",
    "sandbox_isolation",
  ],
};

/** True apenas para tools internas registradas (não-conector). */
export function isInternalTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(INTERNAL_TOOL_CONTROLS, name);
}

export type InternalToolDecision =
  | { allowed: true }
  | { allowed: false; control?: CapabilityControl; message: string };

/** Avalia uma tool interna contra os controles exigidos (fail-closed). */
export function evaluateInternalTool(name: string): InternalToolDecision {
  const required = INTERNAL_TOOL_CONTROLS[name];
  if (!required) {
    return {
      allowed: false,
      message: `Tool interna '${name}' não está registrada. Execução recusada (fail-closed).`,
    };
  }
  const missing = required.find((c) => !IMPLEMENTED_CONTROLS.has(c));
  if (missing) {
    return {
      allowed: false,
      control: missing,
      message: `Tool '${name}' exige o controle '${missing}', que não está implementado. Execução recusada.`,
    };
  }
  return { allowed: true };
}

/** Test-only: descarta o cache para reavaliar após mutar IMPLEMENTED_CONTROLS. */
export function __resetCapabilityRegistryCache() {
  cachedRegistry = null;
}
