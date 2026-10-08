import { validateRedirectUri } from "./tokens";

export type OAuthClientMetadata = {
  clientName: string | null;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: "none";
};

export type OAuthClientPolicy = Pick<OAuthClientMetadata, "redirectUris" | "grantTypes">;
export const DYNAMIC_OAUTH_CLIENT_ID_PREFIX = "prt_client_";
export type RedirectUriProblem = { ok: false; error: "invalid_redirect_uri"; reason: string; redirectUri: string };

type ValidRegistrationResult = { ok: true; metadata: OAuthClientMetadata };
type RegistrationFailure =
  | { ok: false; error: "invalid_client_metadata"; description: string }
  | (RedirectUriProblem & { description: string });
export type RegistrationResult = ValidRegistrationResult | RegistrationFailure;

const MAX_REDIRECT_URIS = 32;
const MAX_URI_LENGTH = 2048;
const SUPPORTED_GRANTS = new Set(["authorization_code", "refresh_token"]);

export function isOAuthRedirectRegistered(
  client: OAuthClientPolicy | null,
  redirectUri: string,
  clientId: string,
): boolean {
  return client ? client.redirectUris.includes(redirectUri) : !clientId.startsWith(DYNAMIC_OAUTH_CLIENT_ID_PREFIX);
}

export function isOAuthGrantRegistered(client: OAuthClientPolicy | null, grantType: string, clientId: string): boolean {
  return client ? client.grantTypes.includes(grantType) : !clientId.startsWith(DYNAMIC_OAUTH_CLIENT_ID_PREFIX);
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return value as string[];
}

function redirectFailure(redirectUri: string, reason: string): RegistrationFailure {
  return {
    ok: false,
    error: "invalid_redirect_uri",
    reason,
    redirectUri,
    description: `redirect_uri recusada (${reason}): ${encodeURIComponent(redirectUri)}`,
  };
}

/** Validate the public-client subset accepted by this authorization server. */
export function parseOAuthClientRegistration(body: unknown): RegistrationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_client_metadata", description: "request body must be a JSON object" };
  }
  const input = body as Record<string, unknown>;
  const rawRedirectUris = readStringArray(input.redirect_uris);
  if (!rawRedirectUris) {
    return { ok: false, error: "invalid_client_metadata", description: "redirect_uris must contain at least one URI string" };
  }

  // Identical callback values are one registration entry, not an ambiguity.
  const redirectUris = [...new Set(rawRedirectUris)];
  if (redirectUris.length > MAX_REDIRECT_URIS || redirectUris.some((uri) => uri.length > MAX_URI_LENGTH)) {
    return { ok: false, error: "invalid_client_metadata", description: "redirect_uris exceeds the supported size or 32 unique URI limit" };
  }
  for (const uri of redirectUris) {
    const valid = validateRedirectUri(uri);
    if (!valid.ok) return redirectFailure(uri, valid.reason);
  }

  const authMethod = input.token_endpoint_auth_method ?? "none";
  if (authMethod !== "none") {
    return { ok: false, error: "invalid_client_metadata", description: "only public clients using token_endpoint_auth_method=none are supported" };
  }

  const grantTypes = input.grant_types === undefined
    ? ["authorization_code", "refresh_token"]
    : readStringArray(input.grant_types);
  if (!grantTypes || !grantTypes.includes("authorization_code") || grantTypes.some((grant) => !SUPPORTED_GRANTS.has(grant))) {
    return { ok: false, error: "invalid_client_metadata", description: "grant_types must include authorization_code and may include refresh_token" };
  }

  const responseTypes = input.response_types === undefined
    ? ["code"]
    : readStringArray(input.response_types);
  if (!responseTypes || responseTypes.length !== 1 || responseTypes[0] !== "code") {
    return { ok: false, error: "invalid_client_metadata", description: "only response_types=[code] is supported" };
  }

  let clientName: string | null = null;
  if (input.client_name !== undefined) {
    if (typeof input.client_name !== "string" || !input.client_name.trim() || input.client_name.length > 128) {
      return { ok: false, error: "invalid_client_metadata", description: "client_name must be a non-empty string of at most 128 characters" };
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
