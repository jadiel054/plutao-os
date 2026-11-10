/**
 * Auth do MCP resource server do Plutão.
 *
 * Aceita Authorization: Bearer <token> onde token é:
 * 1) Access token OAuth (HMAC + grant ativo no DB)
 * 2) PLUTAO_MCP_API_KEY de ops (break-glass, header only, mcp:read)
 *
 * mcp:write só é aceito quando token e grant ativo carregam consentimento explícito.
 * 401 inclui resource_metadata (RFC 9728) para discovery OAuth.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import {
  getMcpIssuer,
  getMcpResourceUrl,
  normalizeScopes,
  timingSafeStringEqual,
  verifyAccessToken,
} from "./tokens";
import { getActiveGrantScopes, touchGrant } from "./grants";
import { isSandboxUuid } from "@/lib/runtime/tools/sandbox";

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

export function hasMcpScope(scope: string): boolean {
  const ctx = getMcpAuth();
  return ctx.scopes.includes(scope);
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

  let claims: ReturnType<typeof verifyAccessToken> = null;
  try {
    claims = verifyAccessToken(token);
  } catch {
    // Token assinado inválido/configuração de assinatura ausente: tenta a ops key abaixo.
  }

  if (claims) {
    const claimedScopes = claims.scope.split(/\s+/).filter(Boolean);
    if (!claimedScopes.includes("mcp:read")) {
      return { ok: false, status: 401, error: "Unauthorized — scope mcp:read exigido." };
    }

    let grantScopes: string[] | null;
    try {
      grantScopes = await getActiveGrantScopes(claims.grant_id);
    } catch {
      // Fail closed: indisponibilidade ou schema incompleto nunca concede write nem read OAuth.
      return { ok: false, status: 503, error: "Indisponível — não foi possível validar o grant OAuth." };
    }
    if (!grantScopes) {
      return { ok: false, status: 401, error: "Unauthorized — grant revogado ou inexistente." };
    }

    const tokenScopes = normalizeScopes(claims.scope, { allowWrite: true }).split(/\s+/);
    const scopes = tokenScopes.filter((scope) => grantScopes.includes(scope));
    if (!scopes.includes("mcp:read")) {
      return { ok: false, status: 401, error: "Unauthorized — scope mcp:read exigido." };
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

  const apiKey = process.env.PLUTAO_MCP_API_KEY?.trim();
  const userId = process.env.PLUTAO_MCP_USER_ID?.trim();
  if (apiKey && userId && timingSafeStringEqual(token, apiKey)) {
    if (!isSandboxUuid(userId)) {
      return {
        ok: false,
        status: 503,
        error: "Configuração inválida: PLUTAO_MCP_USER_ID deve ser UUID.",
      };
    }
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
      ? `Bearer realm="plutao-mcp", resource_metadata="${resourceMeta}", scope="mcp:read mcp:write"`
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
