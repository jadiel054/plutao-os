/**
 * Auth do MCP server do Plutão — Fase 1.
 *
 * Bearer token estático (API key pessoal do operador).
 * Fase 2: OAuth 2.1 + PKCE com o auth do próprio Plutão.
 */

export type McpAuthContext = {
  userId: string;
  /** true se a chave bateu com PLUTAO_MCP_API_KEY */
  ok: true;
};

export type McpAuthResult =
  | McpAuthContext
  | { ok: false; status: 401 | 503; error: string };

/**
 * Valida Authorization: Bearer <token>.
 * Requer env:
 *   PLUTAO_MCP_API_KEY  — segredo longo (openssl rand -hex 32)
 *   PLUTAO_MCP_USER_ID  — UUID do usuário dono (suas missões/conectores)
 */
export function authenticateMcpRequest(req: Request): McpAuthResult {
  const apiKey = process.env.PLUTAO_MCP_API_KEY?.trim();
  const userId = process.env.PLUTAO_MCP_USER_ID?.trim();

  if (!apiKey || !userId) {
    return {
      ok: false,
      status: 503,
      error:
        "MCP server não configurado. Defina PLUTAO_MCP_API_KEY e PLUTAO_MCP_USER_ID no ambiente.",
    };
  }

  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim() || "";

  // Comparação em tempo constante o suficiente para Phase 1 (token de alto entropy).
  if (!token || token.length !== apiKey.length || !timingSafeEqual(token, apiKey)) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized — Bearer token inválido ou ausente.",
    };
  }

  return { ok: true, userId };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export function mcpUnauthorizedResponse(result: Extract<McpAuthResult, { ok: false }>): Response {
  return new Response(JSON.stringify({ error: result.error }), {
    status: result.status,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="plutao-mcp"',
      "Cache-Control": "no-store",
    },
  });
}
