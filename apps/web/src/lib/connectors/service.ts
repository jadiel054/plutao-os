import { randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import { connectors } from "@plutao/db";
import {
  CONNECTOR_CATALOG,
  type ConnectorCapability,
  type ConnectorProviderId,
  type ConnectorPublicView,
  type ConnectorStatus,
} from "@plutao/domain";
import { getDb } from "@/lib/db";
import { encryptToken, decryptToken, canEncryptTokens } from "./crypto";

function asCapabilities(raw: unknown): ConnectorCapability[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is ConnectorCapability =>
      !!c &&
      typeof c === "object" &&
      typeof (c as ConnectorCapability).id === "string" &&
      typeof (c as ConnectorCapability).label === "string"
  );
}

function asScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string");
}

function toPublic(row: typeof connectors.$inferSelect): ConnectorPublicView {
  const meta = CONNECTOR_CATALOG.find((c) => c.id === row.provider);
  return {
    id: row.id,
    provider: row.provider as ConnectorProviderId,
    status: row.status as ConnectorStatus,
    accountLogin: row.accountLogin,
    accountLabel: row.accountLabel,
    scopes: asScopes(row.scopes),
    capabilities: asCapabilities(row.capabilities),
    lastError: row.lastError,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    displayName: meta?.name ?? row.provider,
  };
}

export async function listConnectorsForUser(userId: string): Promise<ConnectorPublicView[]> {
  const db = getDb();
  const rows = await db.select().from(connectors).where(eq(connectors.userId, userId));
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const views: ConnectorPublicView[] = [];
  for (const meta of CONNECTOR_CATALOG) {
    const row = byProvider.get(meta.id);
    if (row) {
      views.push(toPublic(row));
    } else {
      views.push({
        id: `placeholder-${meta.id}`,
        provider: meta.id,
        status: "disconnected",
        accountLogin: null,
        accountLabel: null,
        scopes: [],
        capabilities: [],
        lastError: null,
        connectedAt: null,
        updatedAt: new Date(0).toISOString(),
        displayName: meta.name,
      });
    }
  }
  return views;
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
  const db = getDb();
  const inserted = await db
    .insert(connectors)
    .values({
      userId,
      provider,
      status: "disconnected",
    })
    .returning();
  return inserted[0];
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
  await db
    .update(connectors)
    .set({
      status: "disconnected",
      accessTokenEnc: null,
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      accountLogin: null,
      accountLabel: null,
      scopes: [],
      capabilities: [],
      oauthState: null,
      lastError: null,
      connectedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(connectors.id, row.id));
  return { ok: true as const };
}

export async function getAccessToken(
  userId: string,
  provider: ConnectorProviderId
): Promise<string | null> {
  if (!canEncryptTokens()) return null;
  const row = await getConnectorRow(userId, provider);
  if (!row || row.status !== "connected" || !row.accessTokenEnc) return null;
  try {
    return decryptToken(row.accessTokenEnc);
  } catch {
    return null;
  }
}

export function githubDefaultCapabilities(): ConnectorCapability[] {
  return [
    { id: "repos.read", label: "Ler repositórios" },
    { id: "repos.write", label: "Criar/alterar arquivos e PRs" },
    { id: "issues", label: "Issues e discussões" },
  ];
}
