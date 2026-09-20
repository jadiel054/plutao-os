import { getAppBaseUrl } from "./githubOAuth";

export { getAppBaseUrl };

export function vercelIntegrationConfigured(): boolean {
  return Boolean(
    process.env.VERCEL_CLIENT_ID?.trim() && process.env.VERCEL_CLIENT_SECRET?.trim()
  );
}

export function getVercelClientId(): string {
  return process.env.VERCEL_CLIENT_ID?.trim() || "";
}

export function getVercelClientSecret(): string {
  return process.env.VERCEL_CLIENT_SECRET?.trim() || "";
}

/**
 * Integration Console (vercel.com/dashboard/integrations/console):
 * Redirect URL: {APP_URL}/api/connectors/vercel/callback
 *
 * MCP https://mcp.vercel.com exige allowlist de clientes; Plutão usa REST API
 * com token da Integration ou Access Token até aprovação MCP.
 */
export function buildVercelAuthorizeUrl(opts: {
  state: string;
  redirectUri: string;
}): string {
  const params = new URLSearchParams({
    client_id: getVercelClientId(),
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `https://vercel.com/integrations/token?${params.toString()}`;
}

export async function exchangeVercelCode(opts: {
  code: string;
  redirectUri: string;
}): Promise<
  | { ok: true; accessToken: string; teamId: string | null; userId: string | null }
  | { ok: false; error: string }
> {
  const body = new URLSearchParams({
    client_id: getVercelClientId(),
    client_secret: getVercelClientSecret(),
    code: opts.code,
    redirect_uri: opts.redirectUri,
  });
  const res = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
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
    return { ok: false, error: "access_token ausente na resposta da Vercel" };
  }
  return {
    ok: true,
    accessToken,
    teamId: data.team_id ? String(data.team_id) : null,
    userId: data.user_id ? String(data.user_id) : null,
  };
}

export async function verifyVercelToken(token: string): Promise<
  | { ok: true; login: string; name: string | null; userId: string }
  | { ok: false; error: string }
> {
  const res = await fetch("https://api.vercel.com/v2/user", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = data.error as { message?: string } | undefined;
    return {
      ok: false,
      error: String(errObj?.message || `vercel_user_${res.status}`),
    };
  }
  const user = (data.user ?? data) as Record<string, unknown>;
  const login = String(user.username || user.email || user.id || "vercel-user");
  return {
    ok: true,
    login,
    name: user.name ? String(user.name) : null,
    userId: String(user.uid || user.id || ""),
  };
}

export function vercelDefaultCapabilities() {
  return [
    { name: "projects_list", description: "Listar projetos", kind: "rest_api" as const, mode: "read" as const },
    { name: "deployments_list", description: "Listar deployments", kind: "rest_api" as const, mode: "read" as const },
    { name: "deployment_get", description: "Detalhe de um deployment", kind: "rest_api" as const, mode: "read" as const },
  ];
}
