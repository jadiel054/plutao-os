/**
 * Tokens do MCP Authorization Server do Plutão.
 *
 * - Authorization codes: HMAC transport + jti single-use no DB (mcp_auth_codes)
 * - Access tokens: HMAC, 1h, aud = resource MCP, grant_id para revogação
 * - Refresh tokens: opaco (prt_*), hash no grant, rotação no refresh
 * - Nunca colocar token em query string
 */

import { createHmac, timingSafeEqual, createHash, randomBytes } from "node:crypto";

export const MCP_SCOPES = ["mcp:read"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

const ACCESS_TTL_SEC = 60 * 60;
const CODE_TTL_SEC = 5 * 60;
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30;

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

export function hashOAuthRegistrationIp(ip: string): string {
  return createHmac("sha256", signingKey()).update(`mcp-oauth-registration:${ip}`).digest("hex");
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
  resource: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: "S256";
  grant_id: string;
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
  grant_id: string;
  exp: number;
  iat: number;
  jti: string;
};

export function issueAuthorizationCode(input: {
  userId: string;
  clientId: string;
  redirectUri: string;
  resource?: string;
  scope: string;
  codeChallenge: string;
  grantId: string;
}): { code: string; jti: string; expiresAt: Date } {
  const now = Math.floor(Date.now() / 1000);
  const jti = randomBytes(16).toString("hex");
  const claims: AuthCodeClaims = {
    typ: "mcp_code",
    sub: input.userId,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    resource: input.resource || getMcpResourceUrl(),
    scope: input.scope,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    grant_id: input.grantId,
    iat: now,
    exp: now + CODE_TTL_SEC,
    jti,
  };
  return {
    code: signPayload(claims),
    jti,
    expiresAt: new Date((now + CODE_TTL_SEC) * 1000),
  };
}

export function peekAuthorizationCode(code: string): AuthCodeClaims | null {
  const claims = verifyPayload<AuthCodeClaims>(code);
  if (!claims || claims.typ !== "mcp_code") return null;
  return claims;
}

export function issueAccessToken(input: {
  userId: string;
  clientId: string;
  scope: string;
  grantId: string;
}): { accessToken: string; expiresIn: number; scope: string; tokenType: "Bearer" } {
  const now = Math.floor(Date.now() / 1000);
  const grantedScope = normalizeScopes(input.scope);
  const claims: AccessTokenClaims = {
    typ: "mcp_at",
    sub: input.userId,
    client_id: input.clientId,
    scope: grantedScope,
    aud: getMcpResourceUrl(),
    grant_id: input.grantId,
    iat: now,
    exp: now + ACCESS_TTL_SEC,
    jti: randomBytes(16).toString("hex"),
  };
  return {
    accessToken: signPayload(claims),
    expiresIn: ACCESS_TTL_SEC,
    scope: grantedScope,
    tokenType: "Bearer",
  };
}

export function verifyAccessToken(token: string): AccessTokenClaims | null {
  const claims = verifyPayload<AccessTokenClaims>(token);
  if (!claims || claims.typ !== "mcp_at") return null;
  if (claims.aud !== getMcpResourceUrl()) return null;
  if (!claims.grant_id) return null;
  return { ...claims, scope: normalizeScopes(claims.scope) };
}

export function refreshTtlSec(): number {
  return REFRESH_TTL_SEC;
}

export function refreshExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_TTL_SEC * 1000);
}

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

export function normalizeScopes(_requested: string | null | undefined): string {
  return "mcp:read";
}

/**
 * H5(a) — validação de redirect_uri.
 *
 * Antes: allowlist vazia devolvia `true` (liberava QUALQUER https) e a
 * comparação era por `startsWith`, então `https://app.exemplo.com.evil.io`
 * passava por começar com `https://app.exemplo.com`. Agora:
 *  - allowlist vazia FALHA FECHADO para HTTPS não-CIMD (loopback HTTP é mantido);
 *  - a comparação HTTPS é pela URI completa exata (origin, caminho e query);
 *    uma entrada somente com origin não autoriza callbacks arbitrários.
 */
export type RedirectUriValidation = { ok: true } | { ok: false; reason: string };

/** Validate one exact redirect URI, optionally allowing a CIMD client's own HTTPS origin. */
export function validateRedirectUri(uri: string, options: { sameOriginAs?: string } = {}): RedirectUriValidation {
  if (!uri || uri.length > 2048 || uri.trim() !== uri || /[\u0000-\u0020\u007f]/.test(uri)) {
    return { ok: false, reason: "malformed_uri" };
  }
  if (uri.includes("*")) return { ok: false, reason: "wildcard_not_allowed" };
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return { ok: false, reason: "malformed_uri" };
  }
  if (parsed.username || parsed.password) return { ok: false, reason: "userinfo_not_allowed" };
  if (parsed.hash) return { ok: false, reason: "fragment_not_allowed" };
  if (parsed.protocol === "http:") {
    const host = parsed.hostname.toLowerCase();
    const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
    return isLoopback ? { ok: true } : { ok: false, reason: "http_non_loopback" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "unsupported_scheme" };

  if (options.sameOriginAs) {
    try {
      if (parsed.origin === new URL(options.sameOriginAs).origin) return { ok: true };
    } catch {
      // Invalid metadata origin is not a reason to broaden the exact allowlist.
    }
  }
  const exactAllowlist = [
    ...(process.env.MCP_OAUTH_REDIRECT_ALLOWLIST || "").split(",").map((entry) => entry.trim()).filter(Boolean),
    // Add only provider callback URIs verified from official documentation. Never use wildcard entries.
  ];
  return exactAllowlist.includes(uri)
    ? { ok: true }
    : { ok: false, reason: "https_uri_not_allowlisted" };
}

export function isRedirectUriAllowed(uri: string): boolean {
  return validateRedirectUri(uri).ok;
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
