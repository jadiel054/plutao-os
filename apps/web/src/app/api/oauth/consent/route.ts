import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getMcpIssuer, getMcpResourceUrl, issueAuthorizationCode, normalizeScopes } from "@/lib/mcp/tokens";
import { createGrant, storeAuthCode } from "@/lib/mcp/grants";
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

/** Revalida consentimento antes de criar um grant read-only e código de uso único. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  const form = await req.formData();
  const decision = String(form.get("decision") || "");
  const clientId = String(form.get("client_id") || "").trim();
  const redirectUri = String(form.get("redirect_uri") || "");
  const scope = normalizeScopes(String(form.get("scope") || "mcp:read"));
  const resource = String(form.get("resource") || getMcpResourceUrl());
  const codeChallenge = String(form.get("code_challenge") || "").trim();
  const state = String(form.get("state") || "");

  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (resource !== getMcpResourceUrl()) {
    return NextResponse.json({ error: "invalid_target", error_description: "resource não corresponde a este servidor MCP" }, { status: 400 });
  }
  const resolvedClient = await resolveMcpOAuthClient(clientId);
  if (!resolvedClient.ok) {
    return NextResponse.json({ error: resolvedClient.error, error_description: resolvedClient.description }, { status: 400 });
  }
  const redirectValidation = validateClientRedirectUri(resolvedClient.client, redirectUri);
  if (!redirectValidation.ok) return invalidRedirectResponse(redirectUri, redirectValidation.reason);

  const redirect = new URL(redirectUri);
  if (decision !== "approve") {
    redirect.searchParams.set("error", "access_denied");
    if (state) redirect.searchParams.set("state", state);
    redirect.searchParams.set("iss", getMcpIssuer());
    return NextResponse.redirect(redirect.toString());
  }

  try {
    const { grantId } = await createGrant({ userId: user.id, clientId, redirectUri, scope });
    const issued = issueAuthorizationCode({ userId: user.id, clientId, redirectUri, resource, scope, codeChallenge, grantId });
    await storeAuthCode({
      jti: issued.jti,
      grantId,
      userId: user.id,
      clientId,
      redirectUri,
      scope,
      codeChallenge,
      expiresAt: issued.expiresAt,
    });

    redirect.searchParams.set("code", issued.code);
    if (state) redirect.searchParams.set("state", state);
    redirect.searchParams.set("iss", getMcpIssuer());
    return NextResponse.redirect(redirect.toString());
  } catch {
    return NextResponse.json({ error: "server_error", error_description: "não foi possível criar o grant de autorização" }, { status: 503 });
  }
}
