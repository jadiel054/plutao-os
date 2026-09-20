import { getConnectorManifest } from "./manifests";
import type { ConnectorCapability, ConnectorProviderId } from "@plutao/domain";

export function getAppBaseUrl(reqUrl?: string): string {
  if (process.env.APP_URL?.trim()) return process.env.APP_URL.trim().replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL?.trim())
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (reqUrl) {
    try {
      const u = new URL(reqUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* ignore */
    }
  }
  return "http://localhost:3000";
}

export function isOAuthConfigured(provider: ConnectorProviderId): boolean {
  const manifest = getConnectorManifest(provider);
  if (!manifest || manifest.authMode !== "oauth" || !manifest.oauth) return false;
  const clientId = process.env[manifest.oauth.clientIdEnv]?.trim();
  const clientSecret = process.env[manifest.oauth.clientSecretEnv]?.trim();
  return Boolean(clientId && clientSecret);
}

export function buildAuthorizeUrl(
  provider: ConnectorProviderId,
  opts: { state: string; redirectUri: string }
): string {
  const manifest = getConnectorManifest(provider);
  if (!manifest || !manifest.oauth) {
    throw new Error(`Conector '${provider}' não suporta fluxo OAuth.`);
  }

  const { oauth, defaultScopes = [] } = manifest;
  const paramsObj = oauth.authorizeParams
    ? oauth.authorizeParams(opts.redirectUri, opts.state, defaultScopes)
    : {
        client_id: process.env[oauth.clientIdEnv]?.trim() || "",
        redirect_uri: opts.redirectUri,
        state: opts.state,
      };

  const params = new URLSearchParams(paramsObj);
  return `${oauth.authorizeUrl}?${params.toString()}`;
}

export async function exchangeOAuthCode(
  provider: ConnectorProviderId,
  opts: { code: string; redirectUri: string }
): Promise<
  | { ok: true; accessToken: string; refreshToken?: string | null; scope?: string }
  | { ok: false; error: string }
> {
  const manifest = getConnectorManifest(provider);
  if (!manifest || !manifest.oauth) {
    return { ok: false, error: `Conector '${provider}' não possui configuração OAuth.` };
  }

  const { oauth } = manifest;
  const clientId = process.env[oauth.clientIdEnv]?.trim() || "";
  const clientSecret = process.env[oauth.clientSecretEnv]?.trim() || "";

  let res: Response;
  if (oauth.tokenFormat === "urlencoded") {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
    });
    res = await fetch(oauth.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } else {
    res = await fetch(oauth.tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: opts.code,
        redirect_uri: opts.redirectUri,
      }),
    });
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.error) {
    return {
      ok: false,
      error: String(data.error_description || data.error || `token_exchange_${res.status}`),
    };
  }

  const accessToken = oauth.extractAccessToken
    ? oauth.extractAccessToken(data)
    : String(data.access_token ?? "");

  if (!accessToken) {
    return { ok: false, error: `access_token ausente na resposta de ${manifest.displayName}` };
  }

  return {
    ok: true,
    accessToken,
    refreshToken: data.refresh_token ? String(data.refresh_token) : null,
    scope: data.scope ? String(data.scope) : undefined,
  };
}

export async function fetchUserInfo(
  provider: ConnectorProviderId,
  accessToken: string
): Promise<
  | { ok: true; login: string; name: string | null }
  | { ok: false; error: string }
> {
  const manifest = getConnectorManifest(provider);
  if (!manifest || !manifest.oauth) {
    return { ok: false, error: `Conector '${provider}' não suporta busca de userinfo.` };
  }

  const { oauth } = manifest;
  const headers = oauth.userinfoHeaders
    ? oauth.userinfoHeaders(accessToken)
    : manifest.headers
      ? manifest.headers(accessToken)
      : { Authorization: `Bearer ${accessToken}` };

  const res = await fetch(oauth.userinfoUrl, { headers });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const errObj = typeof data.error === "object" && data.error ? (data.error as { message?: string }) : undefined;
    return {
      ok: false,
      error: String(data.message || errObj?.message || `userinfo_${res.status}`),
    };
  }

  const login = oauth.extractUserLogin(data);
  if (!login) return { ok: false, error: "login ausente na resposta do usuário" };

  const name = typeof data.name === "string" ? data.name : null;
  return { ok: true, login, name };
}

export async function verifyToken(
  provider: ConnectorProviderId,
  token: string
): Promise<
  | { ok: true; login: string; name?: string | null }
  | { ok: false; error: string }
> {
  const manifest = getConnectorManifest(provider);
  if (!manifest) return { ok: false, error: `Conector '${provider}' desconhecido.` };

  const verifyUrl = manifest.tokenConfig?.verifyUrl || manifest.oauth?.userinfoUrl;
  if (!verifyUrl) return { ok: false, error: `Conector '${provider}' não tem URL de verificação de token.` };

  const headers = manifest.tokenConfig?.verifyHeaders
    ? manifest.tokenConfig.verifyHeaders(token)
    : manifest.headers
      ? manifest.headers(token)
      : { Authorization: `Bearer ${token}` };

  const res = await fetch(verifyUrl, { headers });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const errObj = typeof data.error === "object" && data.error ? (data.error as { message?: string }) : undefined;
    return {
      ok: false,
      error: String(data.message || errObj?.message || `verify_token_${res.status}`),
    };
  }

  const extractLogin = manifest.tokenConfig?.extractUserLogin || manifest.oauth?.extractUserLogin;
  const login = extractLogin ? extractLogin(data) : "user";

  return { ok: true, login, name: typeof data.name === "string" ? data.name : null };
}

export function getDefaultCapabilities(provider: ConnectorProviderId): ConnectorCapability[] {
  const manifest = getConnectorManifest(provider);
  if (!manifest) return [];
  return manifest.capabilities.map((c) => ({
    name: c.name,
    description: c.description,
    kind: "rest_api" as const,
    mode: c.mode,
  }));
}
