import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { connectors } from "@plutao/db";
import {
  CONNECTOR_CATALOG,
  getCatalogEntry,
  type ConnectorCapability,
  type ConnectorProviderId,
  type ConnectorPublicView,
  type ConnectorStatus,
} from "@plutao/domain";
import { getDb } from "@/lib/db";
import { encryptToken, decryptToken } from "./crypto";

function asCapabilities(raw: unknown): ConnectorCapability[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      name: String(c.name ?? ""),
      description: c.description ? String(c.description) : undefined,
      kind: c.kind === "mcp_tool" ? ("mcp_tool" as const) : ("rest_api" as const),
      mode: c.mode === "write" ? ("write" as const) : ("read" as const),
    }))
    .filter((c) => c.name.length > 0);
}

function asScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s)).filter(Boolean);
}

function toPublic(row: typeof connectors.$inferSelect): ConnectorPublicView {
  const catalog = getCatalogEntry(row.provider as ConnectorProviderId);
  return {
    id: row.id,
    provider: row.provider as ConnectorProviderId,
    displayName: catalog?.displayName ?? row.provider,
    status: row.status as ConnectorStatus,
    serverUrl: row.serverUrl,
    accountLogin: row.accountLogin,
    accountLabel: row.accountLabel,
    capabilities: asCapabilities(row.capabilities),
    scopes: asScopes(row.scopes),
    lastError: row.lastError,
    connectedAt: row.connectedAt ? row.connectedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Lista catálogo + estado do usuário (cria visão disconnected se ainda não houver row). */
export async function listConnectorsForUser(userId: string): Promise<ConnectorPublicView[]> {
  const db = getDb();
  const rows = await db.select().from(connectors).where(eq(connectors.userId, userId));
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  return CONNECTOR_CATALOG.map((entry) => {
    const row = byProvider.get(entry.provider);
    if (row) return toPublic(row);
    return {
      id: `virtual:${entry.provider}`,
      provider: entry.provider,
      displayName: entry.displayName,
      status: "disconnected" as const,
      serverUrl: entry.defaultServerUrl,
      accountLogin: null,
      accountLabel: null,
      capabilities: [],
      scopes: [],
      lastError: null,
      connectedAt: null,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function getConnectorRow(userId: string, provider: ConnectorProviderId) {
  const db = getDb();
  const rows = await db
    .select()
    .from(connectors)
    .where(and(eq(connectors.userId, userId), eq(connectors.provider, provider)))
    .limit(1);
  return rows[0] ?? null;
}

export async function ensureConnectorRow(userId: string, provider: ConnectorProviderId) {
  const existing = await getConnectorRow(userId, provider);
  if (existing) return existing;
  const catalog = getCatalogEntry(provider);
  const db = getDb();
  const inserted = await db
    .insert(connectors)
    .values({
      userId,
      provider,
      status: "disconnected",
      serverUrl: catalog?.defaultServerUrl ?? null,
      scopes: [],
      capabilities: [],
    })
    .returning();
  const created = inserted[0];
  if (!created) {
    throw new Error("Falha ao criar registro do conector");
  }
  return created;
}

export async function beginOAuth(
  userId: string,
  provider: ConnectorProviderId
): Promise<{ state: string; rowId: string }> {
  const row = await ensureConnectorRow(userId, provider);
  const state = randomBytes(24).toString("hex");
  const db = getDb();
  await db
    .update(connectors)
    .set({
      status: "authorizing",
      oauthState: state,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(connectors.id, row.id));
  return { state, rowId: row.id };
}

export async function completeOAuth(opts: {
  userId: string;
  provider: ConnectorProviderId;
  state: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  accountLogin: string;
  accountLabel?: string | null;
  scopes: string[];
  capabilities: ConnectorCapability[];
}): Promise<
  | { connector: ConnectorPublicView }
  | { error: "NOT_FOUND" | "STATE_MISMATCH" | "UPDATE_FAILED" }
> {
  const row = await getConnectorRow(opts.userId, opts.provider);
  if (!row) return { error: "NOT_FOUND" as const };
  if (row.oauthState !== opts.state) return { error: "STATE_MISMATCH" as const };

  const db = getDb();
  const now = new Date();
  const updated = await db
    .update(connectors)
    .set({
      status: "connected",
      accessTokenEnc: encryptToken(opts.accessToken),
      refreshTokenEnc: opts.refreshToken ? encryptToken(opts.refreshToken) : null,
      tokenExpiresAt: opts.expiresAt ?? null,
      accountLogin: opts.accountLogin,
      accountLabel: opts.accountLabel ?? opts.accountLogin,
      scopes: opts.scopes,
      capabilities: opts.capabilities,
      oauthState: null,
      lastError: null,
      connectedAt: now,
      updatedAt: now,
    })
    .where(eq(connectors.id, row.id))
    .returning();
  const next = updated[0];
  if (!next) return { error: "UPDATE_FAILED" as const };
  return { connector: toPublic(next) };
}

export async function failOAuth(
  userId: string,
  provider: ConnectorProviderId,
  message: string
) {
  const row = await getConnectorRow(userId, provider);
  if (!row) return;
  const db = getDb();
  await db
    .update(connectors)
    .set({
      status: "error",
      lastError: message.slice(0, 500),
      oauthState: null,
      updatedAt: new Date(),
    })
    .where(eq(connectors.id, row.id));
}

export async function disconnectConnector(userId: string, provider: ConnectorProviderId) {
  const row = await getConnectorRow(userId, provider);
  if (!row) return { error: "NOT_FOUND" as const };
  const db = getDb();
  const catalog = getCatalogEntry(provider);
  const updated = await db
    .update(connectors)
    .set({
      status: "disconnected",
      accessTokenEnc: null,
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      accountLogin: null,
      accountLabel: null,
      capabilities: [],
      scopes: [],
      oauthState: null,
      lastError: null,
      connectedAt: null,
      serverUrl: catalog?.defaultServerUrl ?? row.serverUrl,
      updatedAt: new Date(),
    })
    .where(eq(connectors.id, row.id))
    .returning();
  const next = updated[0];
  if (!next) return { error: "NOT_FOUND" as const };
  return { connector: toPublic(next) };
}

/** Lê token em claro só no servidor (Executor / OAuth refresh). */
export async function getAccessToken(
  userId: string,
  provider: ConnectorProviderId
): Promise<string | null> {
  const row = await getConnectorRow(userId, provider);
  if (!row || row.status !== "connected" || !row.accessTokenEnc) return null;
  try {
    return decryptToken(row.accessTokenEnc);
  } catch {
    return null;
  }
}

/** Capacidades padrão GitHub após OAuth bem-sucedido (REST mapeadas para o Executor). */
export function githubDefaultCapabilities(): ConnectorCapability[] {
  return [
    { name: "repos_list", description: "Listar repositórios do usuário", kind: "rest_api", mode: "read" },
    { name: "issues_list", description: "Listar issues de um repositório", kind: "rest_api", mode: "read" },
    { name: "issues_get", description: "Obter issue por número", kind: "rest_api", mode: "read" },
    { name: "pulls_list", description: "Listar pull requests", kind: "rest_api", mode: "read" },
    { name: "actions_list", description: "Listar workflow runs", kind: "rest_api", mode: "read" },
    { name: "repo_get", description: "Metadados de um repositório", kind: "rest_api", mode: "read" },
  ];
}
