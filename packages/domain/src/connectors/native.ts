/**
 * Catálogo nativo de conectores MCP do Plutão.
 *
 * Estes não são “plugins genéricos”: são integrações de primeira classe
 * para o ciclo de produto (código → banco → deploy → cobrança).
 *
 * Endpoints remotos oficiais / conhecidos (Streamable HTTP ou SSE).
 * Auth: preferir OAuth remoto do provedor; fallback PAT só onde o provedor exigir.
 *
 * Ordem de implementação no produto:
 *   Wave A — núcleo de build: github, vercel, neon
 *   Wave B — backend + monetização: supabase, stripe
 *   Wave C — operação e trabalho: cloudflare, linear, notion, sentry, resend
 */

export type ConnectorAuthMode = "oauth" | "oauth_or_pat" | "pat" | "none";

export type ConnectorWave = "A" | "B" | "C";

export type ConnectorCategory =
  | "code"
  | "deploy"
  | "database"
  | "backend"
  | "payments"
  | "infra"
  | "work"
  | "observability"
  | "email";

export interface NativeConnectorDefinition {
  id: string;
  name: string;
  category: ConnectorCategory;
  wave: ConnectorWave;
  /** URL do servidor MCP remoto (quando hospedado pelo provedor) */
  mcpUrl: string;
  authMode: ConnectorAuthMode;
  /** Por que é nativo no Plutão */
  whyNative: string;
  /** Capacidades típicas expostas (inventário; lista real vem do server após connect) */
  capabilityHints: string[];
}

/**
 * Wave A — essencial para “construir e entregar” (código, DB que já usamos, deploy).
 */
export const NATIVE_CONNECTORS_WAVE_A: NativeConnectorDefinition[] = [
  {
    id: "github",
    name: "GitHub",
    category: "code",
    wave: "A",
    mcpUrl: "https://api.githubcopilot.com/mcp/",
    authMode: "oauth",
    whyNative:
      "Repos, issues, PRs e actions — base de qualquer missão de software.",
    capabilityHints: [
      "repos",
      "issues",
      "pull_requests",
      "actions",
      "code_search",
      "comments",
    ],
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "deploy",
    wave: "A",
    mcpUrl: "https://mcp.vercel.com",
    authMode: "oauth",
    whyNative:
      "Deploy e logs do próprio stack do Plutão e dos artefatos que o usuário entrega.",
    capabilityHints: [
      "projects",
      "deployments",
      "deployment_logs",
      "docs_search",
    ],
  },
  {
    id: "neon",
    name: "Neon",
    category: "database",
    wave: "A",
    mcpUrl: "https://mcp.neon.tech/mcp",
    authMode: "oauth",
    whyNative:
      "Postgres serverless que o Plutão já usa em produção; branches e schema em linguagem natural.",
    capabilityHints: [
      "projects",
      "branches",
      "sql",
      "migrations",
      "connection_strings",
    ],
  },
];

/**
 * Wave B — backend alternativo + cobrança (assinaturas do produto e dos clientes).
 */
export const NATIVE_CONNECTORS_WAVE_B: NativeConnectorDefinition[] = [
  {
    id: "supabase",
    name: "Supabase",
    category: "backend",
    wave: "B",
    mcpUrl: "https://mcp.supabase.com/mcp",
    authMode: "oauth",
    whyNative:
      "Auth, Postgres, storage e edge — stack comum nos sistemas que o Plutão entrega.",
    capabilityHints: [
      "database",
      "auth",
      "storage",
      "functions",
      "migrations",
      "logs",
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "payments",
    wave: "B",
    mcpUrl: "https://mcp.stripe.com",
    authMode: "oauth",
    whyNative:
      "Assinaturas e cobrança — núcleo do modelo de negócio do Plutão e dos produtos gerados.",
    capabilityHints: [
      "customers",
      "subscriptions",
      "invoices",
      "products",
      "prices",
      "payment_links",
    ],
  },
];

/**
 * Wave C — operação, trabalho e observabilidade (esforço moderado; MCP remoto oficial).
 */
export const NATIVE_CONNECTORS_WAVE_C: NativeConnectorDefinition[] = [
  {
    id: "cloudflare",
    name: "Cloudflare",
    category: "infra",
    wave: "C",
    mcpUrl: "https://mcp.cloudflare.com/mcp",
    authMode: "oauth",
    whyNative: "Workers, R2, DNS — infra além do Vercel quando a missão pede.",
    capabilityHints: ["workers", "kv", "r2", "dns"],
  },
  {
    id: "linear",
    name: "Linear",
    category: "work",
    wave: "C",
    mcpUrl: "https://mcp.linear.app/mcp",
    authMode: "oauth",
    whyNative: "Issues e ciclos — alinhar missão com backlog real.",
    capabilityHints: ["issues", "projects", "cycles", "teams"],
  },
  {
    id: "notion",
    name: "Notion",
    category: "work",
    wave: "C",
    mcpUrl: "https://mcp.notion.com/mcp",
    authMode: "oauth",
    whyNative: "Docs e bases — brief, specs e conhecimento do projeto.",
    capabilityHints: ["pages", "databases", "search"],
  },
  {
    id: "sentry",
    name: "Sentry",
    category: "observability",
    wave: "C",
    mcpUrl: "https://mcp.sentry.dev/mcp",
    authMode: "oauth",
    whyNative: "Erros em produção — fechar o loop Verificador com evidência real.",
    capabilityHints: ["issues", "errors", "performance"],
  },
  {
    id: "slack",
    name: "Slack",
    category: "work",
    wave: "C",
    mcpUrl: "https://mcp.slack.com/mcp",
    authMode: "oauth",
    whyNative: "Notificar progresso de missão e coletar confirmações no time.",
    capabilityHints: ["channels", "messages", "search"],
  },
];

export const NATIVE_CONNECTORS: NativeConnectorDefinition[] = [
  ...NATIVE_CONNECTORS_WAVE_A,
  ...NATIVE_CONNECTORS_WAVE_B,
  ...NATIVE_CONNECTORS_WAVE_C,
];

export function getNativeConnector(
  id: string
): NativeConnectorDefinition | undefined {
  return NATIVE_CONNECTORS.find((c) => c.id === id);
}

export function listNativeConnectorsByWave(
  wave: ConnectorWave
): NativeConnectorDefinition[] {
  return NATIVE_CONNECTORS.filter((c) => c.wave === wave);
}

/** Estados de conexão — contrato de produto (não só “ligado/desligado”). */
export type ConnectorConnectionStatus =
  | "disconnected"
  | "authorizing"
  | "connected"
  | "reconnect"
  | "error";

export const CONNECTOR_STATUS_FLOW: ConnectorConnectionStatus[] = [
  "disconnected",
  "authorizing",
  "connected",
  "reconnect",
  "error",
];
