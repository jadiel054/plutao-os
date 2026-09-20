/**
 * Conectores MCP / OAuth — produto Plutão
 *
 * Estados obrigatórios (não é “conectado ✓” vazio):
 *   disconnected → authorizing → connected
 *   connected → reconnecting → connected | error
 *   * → error → disconnected | authorizing (reconectar)
 */

export type ConnectorProviderId = "github";

export type ConnectorStatus =
  | "disconnected"
  | "authorizing"
  | "connected"
  | "reconnecting"
  | "error";

export type ConnectorCapability = {
  name: string;
  description?: string;
  /** Origem: mcp_tool | rest_api */
  kind: "mcp_tool" | "rest_api";
  /** Modo de operação: read (padrão) ou write (exige gate de aprovação) */
  mode?: "read" | "write";
};

export type ConnectorPublicView = {
  id: string;
  provider: ConnectorProviderId;
  displayName: string;
  status: ConnectorStatus;
  serverUrl: string | null;
  accountLogin: string | null;
  accountLabel: string | null;
  capabilities: ConnectorCapability[];
  scopes: string[];
  lastError: string | null;
  connectedAt: string | null;
  updatedAt: string;
};

export type ConnectorCatalogEntry = {
  provider: ConnectorProviderId;
  displayName: string;
  description: string;
  /** Escopos OAuth pedidos na autorização */
  defaultScopes: string[];
  /** URL do servidor MCP quando aplicável (informativa na UI) */
  defaultServerUrl: string | null;
};

/** Catálogo V1 — só GitHub. Outros providers entram sem genérico. */
export const CONNECTOR_CATALOG: ConnectorCatalogEntry[] = [
  {
    provider: "github",
    displayName: "GitHub",
    description:
      "Repositórios, issues, pull requests e actions da sua conta. OAuth real; o Executor só usa o que estiver conectado.",
    defaultScopes: ["repo", "read:user", "workflow"],
    defaultServerUrl: "https://api.github.com",
  },
];

const STATUS_TRANSITIONS: Record<ConnectorStatus, ConnectorStatus[]> = {
  disconnected: ["authorizing"],
  authorizing: ["connected", "error", "disconnected"],
  connected: ["reconnecting", "disconnected", "error"],
  reconnecting: ["connected", "error", "disconnected"],
  error: ["authorizing", "disconnected", "reconnecting"],
};

export function canTransitionConnector(
  from: ConnectorStatus,
  to: ConnectorStatus
): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getCatalogEntry(
  provider: ConnectorProviderId
): ConnectorCatalogEntry | undefined {
  return CONNECTOR_CATALOG.find((c) => c.provider === provider);
}
