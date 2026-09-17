import { getCatalogEntry } from "@plutao/domain";

export function githubOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()
  );
}

export function getGitHubClientId(): string {
  return process.env.GITHUB_CLIENT_ID?.trim() || "";
}

export function getGitHubClientSecret(): string {
  return process.env.GITHUB_CLIENT_SECRET?.trim() || "";
}

/** Base URL pública do app (callback). */
export function getAppBaseUrl(reqUrl: string): string {
  if (process.env.APP_URL?.trim()) return process.env.APP_URL.trim().replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL?.trim())
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  try {
    const u = new URL(reqUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:3000";
  }
}

export function buildGitHubAuthorizeUrl(opts: {
  state: string;
  redirectUri: string;
}): string {
  const catalog = getCatalogEntry("github");
  const scopes = (catalog?.defaultScopes ?? ["repo", "read:user"]).join(" ");
  const params = new URLSearchParams({
    client_id: getGitHubClientId(),
    redirect_uri: opts.redirectUri,
    scope: scopes,
    state: opts.state,
    allow_signup: "false",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGitHubCode(opts: {
  code: string;
  redirectUri: string;
}): Promise<
  | { ok: true; accessToken: string; scope: string; tokenType: string }
  | { ok: false; error: string }
> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: getGitHubClientId(),
      client_secret: getGitHubClientSecret(),
      code: opts.code,
      redirect_uri: opts.redirectUri,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.error) {
    return {
      ok: false,
      error: String(data.error_description || data.error || `token_exchange_${res.status}`),
    };
  }
  const accessToken = String(data.access_token ?? "");
  if (!accessToken) {
    return { ok: false, error: "access_token ausente na resposta do GitHub" };
  }
  return {
    ok: true,
    accessToken,
    scope: String(data.scope ?? ""),
    tokenType: String(data.token_type ?? "bearer"),
  };
}

export async function fetchGitHubUser(accessToken: string): Promise<
  | { ok: true; login: string; name: string | null }
  | { ok: false; error: string }
> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Plutao-OS",
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: String(data.message || `user_${res.status}`) };
  }
  const login = String(data.login ?? "");
  if (!login) return { ok: false, error: "login ausente" };
  return {
    ok: true,
    login,
    name: data.name ? String(data.name) : null,
  };
}
