import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getMcpIssuer, getMcpResourceUrl, normalizeScopes } from "@/lib/mcp/tokens";
import { resolveMcpOAuthClient, validateClientRedirectUri } from "@/lib/mcp/clientMetadata";

export const runtime = "nodejs";

function invalidRedirectResponse(redirectUri: string, reason: string) {
  return NextResponse.json({
    error: "invalid_redirect_uri",
    error_description: `redirect_uri recusada (${reason}): ${encodeURIComponent(redirectUri)}`,
    reason,
    invalid_uri: redirectUri,
  }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

/** OAuth 2.1 authorization-code endpoint with PKCE S256 and client registration validation. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id")?.trim() || "";
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const state = url.searchParams.get("state") || "";
  const scope = normalizeScopes(url.searchParams.get("scope"));
  const resource = url.searchParams.get("resource") || getMcpResourceUrl();
  const codeChallenge = url.searchParams.get("code_challenge")?.trim() || "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "";

  if (responseType !== "code") {
    return NextResponse.json({ error: "unsupported_response_type" }, { status: 400 });
  }
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "invalid_request", error_description: "client_id e redirect_uri obrigatórios" }, { status: 400 });
  }
  if (resource !== getMcpResourceUrl()) {
    return NextResponse.json({ error: "invalid_target", error_description: "resource não corresponde a este servidor MCP" }, { status: 400 });
  }

  const resolvedClient = await resolveMcpOAuthClient(clientId);
  if (!resolvedClient.ok) {
    return NextResponse.json({ error: resolvedClient.error, error_description: resolvedClient.description }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const redirectValidation = validateClientRedirectUri(resolvedClient.client, redirectUri);
  if (!redirectValidation.ok) return invalidRedirectResponse(redirectUri, redirectValidation.reason);
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return NextResponse.json({
      error: "invalid_request",
      error_description: "PKCE S256 obrigatório (code_challenge + code_challenge_method=S256)",
    }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) {
    const returnTo = `${url.pathname}${url.search}`;
    const login = new URL("/login", getMcpIssuer());
    login.searchParams.set("next", returnTo);
    return NextResponse.redirect(login.toString());
  }

  const consent = new URL("/oauth/consent", getMcpIssuer());
  consent.searchParams.set("client_id", clientId);
  consent.searchParams.set("redirect_uri", redirectUri);
  consent.searchParams.set("scope", scope);
  consent.searchParams.set("resource", resource);
  consent.searchParams.set("code_challenge", codeChallenge);
  consent.searchParams.set("code_challenge_method", "S256");
  if (state) consent.searchParams.set("state", state);
  return NextResponse.redirect(consent.toString());
}
