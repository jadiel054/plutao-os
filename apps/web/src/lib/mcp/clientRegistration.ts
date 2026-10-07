import { isRedirectUriAllowed } from "@/lib/mcp/tokens";

export type OAuthClientRegistration = {
  clientName: string | null;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: "none";
};

export type OAuthClientPolicy = Pick<OAuthClientRegistration, "redirectUris" | "grantTypes">;
export const DYNAMIC_OAUTH_CLIENT_ID_PREFIX = "prt_client_";

type RegistrationResult =
  | { ok: true; metadata: OAuthClientRegistration }
  | { ok: false; error: string };

const MAX_REDIRECT_URIS = 32;
const MAX_URI_LENGTH = 2048;
const SUPPORTED_GRANTS = new Set(["authorization_code", "refresh_token"]);

export function isOAuthRedirectRegistered(
  client: OAuthClientPolicy | null,
  redirectUri: string,
  clientId: string
): boolean {
  return client ? client.redirectUris.includes(redirectUri) : !clientId.startsWith(DYNAMIC_OAUTH_CLIENT_ID_PREFIX);
}

export function isOAuthGrantRegistered(client: OAuthClientPolicy | null, grantType: string, clientId: string): boolean {
  return client ? client.grantTypes.includes(grantType) : !clientId.startsWith(DYNAMIC_OAUTH_CLIENT_ID_PREFIX);
}

function isValidRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URI_LENGTH) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    !parsed.hash &&
    !parsed.username &&
    !parsed.password &&
    isRedirectUriAllowed(value)
  );
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return value as string[];
}

/** Validate the public-client subset accepted by this OAuth authorization server. */
export function parseOAuthClientRegistration(body: unknown): RegistrationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const input = body as Record<string, unknown>;
  const redirectUris = readStringArray(input.redirect_uris);
  if (!redirectUris || redirectUris.length > MAX_REDIRECT_URIS) {
    return { ok: false, error: "redirect_uris must contain between 1 and 32 URI strings" };
  }
  if (new Set(redirectUris).size !== redirectUris.length || redirectUris.some((uri) => !isValidRedirectUri(uri))) {
    return { ok: false, error: "redirect_uris contains a duplicate or unsupported URI" };
  }

  const authMethod = input.token_endpoint_auth_method ?? "none";
  if (authMethod !== "none") {
    return { ok: false, error: "only public clients using token_endpoint_auth_method=none are supported" };
  }

  const grantTypes = input.grant_types === undefined
    ? ["authorization_code", "refresh_token"]
    : readStringArray(input.grant_types);
  if (
    !grantTypes ||
    !grantTypes.includes("authorization_code") ||
    grantTypes.some((grant) => !SUPPORTED_GRANTS.has(grant))
  ) {
    return { ok: false, error: "grant_types must include authorization_code and may include refresh_token" };
  }

  const responseTypes = input.response_types === undefined
    ? ["code"]
    : readStringArray(input.response_types);
  if (!responseTypes || responseTypes.length !== 1 || responseTypes[0] !== "code") {
    return { ok: false, error: "only response_types=[code] is supported" };
  }

  let clientName: string | null = null;
  if (input.client_name !== undefined) {
    if (typeof input.client_name !== "string" || input.client_name.trim().length === 0 || input.client_name.length > 128) {
      return { ok: false, error: "client_name must be a non-empty string of at most 128 characters" };
    }
    clientName = input.client_name.trim();
  }

  return {
    ok: true,
    metadata: {
      clientName,
      redirectUris,
      grantTypes,
      responseTypes,
      tokenEndpointAuthMethod: "none",
    },
  };
}
