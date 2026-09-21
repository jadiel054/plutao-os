/**
 * Auth do MCP resource server do Plutão.
 *
 * Aceita Authorization: Bearer <token> onde token é:
 * 1) Access token OAuth (HMAC + grant ativo no DB)
 * 2) PLUTAO_MCP_API_KEY de ops (break-glass, header only)
 *
 * 401 inclui resource_metadata (RFC 9728) para discovery OAuth.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import {
  getMcpIssuer,
  getMcpResourceUrl,
  timingSafeStringEqual,
  verifyAccessToken,
} from "./tokens";
import { isGrantActive, touchGrant } from "./grants";

export type McpAuthContext = {
  userId: string;
  scopes: string[];
  clientId: string;
  grantId?: string;
  method: "oauth" | "ops_key";
};

export const mcpAuthStore = new AsyncLocalStorage<McpAuthContext>();

export function getMcpAuth(): McpAuthContext {
  const ctx = mcpAuthStore.getStore();
  if (!ctx) throw new Error("MCP auth context missing");
  return ctx;
}

export type McpAuthResult =
  | ({ ok: true } & McpAuthContext)
  | { ok: false; status: 401 | 503; error: string };

function extractBearer(req: Request): string {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || "";
}

export async function authenticateMcpRequest(req: Request): Promise<McpAuthResult> {
  const token = extractBearer(req);
  if (!token) {
    return { ok: false, status: 401, error: "Unauthorized — Bearer token ausente." };
  }

  try {
    const claims = verifyAccessToken(token);
    if (claims) {
      const scopes = claims.scope.split(/\s+/).filter(Boolean);
      if (!scopes.includes("mcp:read")) {
        return { ok: false, status: 401, error: "Unauthorized — scope mcp:read exigido." };
      }
      const active = await isGrantActive(claims.grant_id);
      if (!active) {
        return { ok: false, status: 401, error: "Unauthorized — grant revogado ou inexistente." };
      }
      void touchGrant(claims.grant_id).catch(() => undefined);
      return {
        ok: true,
        userId: claims.sub,
        scopes,
        clientId: claims.client_id,
        grantId: claims.grant_id,
        method: "oauth",
      };
    }
  } catch {
    /* signing key missing or invalid — tenta ops key */
  }

  const apiKey = process.env.PLUTAO_MCP_API_KEY?.trim();
  const userId = process.env.PLUTAO_MCP_USER_ID?.trim();
  if (apiKey && userId && timingSafeStringEqual(token, apiKey)) {
    return {
      ok: true,
      userId,
      scopes: ["mcp:read"],
      clientId: "plutao-ops",
      method: "ops_key",
    };
  }

  return { ok: false, status: 401, error: "Unauthorized — Bearer token inválido." };
}

export function mcpUnauthorizedResponse(result: Extract<McpAuthResult, { ok: false }>): Response {
  const resourceMeta = `${getMcpIssuer()}/.well-known/oauth-protected-resource`;
  const www =
    result.status === 401
      ? `Bearer realm="plutao-mcp", resource_metadata="${resourceMeta}", scope="mcp:read"`
      : `Bearer realm="plutao-mcp"`;

  return new Response(JSON.stringify({ error: result.error }), {
    status: result.status,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": www,
      "Cache-Control": "no-store",
    },
  });
}

export function mcpResourceUrl(): string {
  return getMcpResourceUrl();
}
