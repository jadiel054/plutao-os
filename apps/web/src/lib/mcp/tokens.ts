/**
 * Tokens do MCP Authorization Server do Plutão.
 *
 * - Authorization codes e access tokens são payloads HMAC-SHA256
 *   (sem DB; adequado a Vercel serverless).
 * - Access token: curto (1h), audience = resource MCP, scopes explícitos.
 * - Nunca colocar token em query string de produção nas tools.
 */

import { createHmac, timingSafeEqual, createHash, randomBytes } from "node:crypto";

export const MCP_SCOPES = ["mcp:read"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

const ACCESS_TTL_SEC = 60 * 60; // 1h
const CODE_TTL_SEC = 5 * 60; // 5 min

function signingKey(): Buffer {
  const raw =
    process.env.MCP_TOKEN_SECRET?.trim() ||
    process.env.CONNECTOR_TOKEN_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "";
  if (raw.length < 16) {
    throw new Error("MCP_TOKEN_SECRET (ou SESSION_SECRET ≥16) obrigatório para OAuth MCP");
  }
  return createHash("sha256").update(raw).digest();
}

function b64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf.toString("base64url");
}

function signPayload(obj: Record<string, unknown>): string {
  const body = b64url(JSON.stringify(obj));
  const sig = createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyPayload<T extends Record<string, unknown>>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = createHmac("sha256", signingKey()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (typeof json.exp === "number" && json.exp * 1000 < Date.now()) return null;
    return json;
  } catch {
    return null;
  }
}

export function getMcpResourceUrl(): string {
  const app = (process.env.APP_URL || "https://plutao-os.vercel.app").replace(/\/$/, "");
  return `${app}/api/mcp`;
}

export function getMcpIssuer(): string {
  return (process.env.APP_URL || "https://plutao-os.vercel.app").replace(/\/$/, "");
}

export type AuthCodeClaims = {
  typ: "mcp_code";
  sub: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: "S256";
  exp: number;
  iat: number;
  jti: string;
};

export type AccessTokenClaims = {
  typ: "mcp_at";
  sub: string;
  client_id: string;
  scope: string;
  aud: string;
  exp: number;
  iat: number;
  jti: string;
};

export function issueAuthorizationCode(input: {
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: AuthCodeClaims = {
    typ: "mcp_code",
    sub: input.userId,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: input.scope,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    iat: now,
    exp: now + CODE_TTL_SEC,
    jti: randomBytes(16).toString("hex"),
  };
  return signPayload(claims);
}

export function consumeAuthorizationCode(code: string): AuthCodeClaims | null {
  const claims = verifyPayload<AuthCodeClaims>(code);
  if (!claims || claims.typ !== "mcp_code") return null;
  return claims;
}

export function issueAccessToken(input: {
  userId: string;
  clientId: string;
  scope: string;
}): { accessToken: string; expiresIn: number; scope: string; tokenType: "Bearer" } {
  const now = Math.floor(Date.now() / 1000);
  const claims: AccessTokenClaims = {
    typ: "mcp_at",
    sub: input.userId,
    client_id: input.clientId,
    scope: input.scope,
    aud: getMcpResourceUrl(),
    iat: now,
    exp: now + ACCESS_TTL_SEC,
    jti: randomBytes(16).toString("hex"),
  };
  return {
    accessToken: signPayload(claims),
    expiresIn: ACCESS_TTL_SEC,
    scope: input.scope,
    tokenType: "Bearer",
  };
}

export function verifyAccessToken(token: string): AccessTokenClaims | null {
  const claims = verifyPayload<AccessTokenClaims>(token);
  if (!claims || claims.typ !== "mcp_at") return null;
  if (claims.aud !== getMcpResourceUrl()) return null;
  return claims;
}

/** PKCE S256: BASE64URL(SHA256(verifier)) === challenge */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  try {
    const a = Buffer.from(computed);
    const b = Buffer.from(challenge);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function normalizeScopes(requested: string | null | undefined): string {
  const parts = (requested || "mcp:read")
    .split(/[\s+]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = new Set<string>(MCP_SCOPES);
  const out = parts.filter((p) => allowed.has(p));
  if (out.length === 0) return "mcp:read";
  return [...new Set(out)].join(" ");
}

/**
 * Redirect URIs permitidos:
 * - http://localhost / 127.0.0.1 (qualquer porta) — clientes locais
 * - https:// — obrigatório em produção para remotos
 * - lista extra em MCP_OAUTH_REDIRECT_ALLOWLIST (prefixos, vírgula)
 */
export function isRedirectUriAllowed(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.protocol === "http:") {
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  }
  if (parsed.protocol !== "https:") return false;

  const allow = (process.env.MCP_OAUTH_REDIRECT_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length === 0) {
    // Padrão seguro: qualquer https (usuário vê URI na tela de consentimento)
    return true;
  }
  return allow.some((prefix) => uri === prefix || uri.startsWith(prefix));
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
