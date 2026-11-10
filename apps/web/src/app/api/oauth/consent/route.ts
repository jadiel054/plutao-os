import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  getMcpIssuer,
  getMcpResourceUrl,
  issueAuthorizationCode,
  normalizeScopes,
  verifyConsentTicket,
} from "@/lib/mcp/tokens";
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

/** Revalida um ticket de consentimento assinado antes de criar grant e código de uso único. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  const form = await req.formData();
  const decision = String(form.get("decision") || "");
  const ticketText = String(form.get("consent_ticket") || "");
  let ticket;
  try {
    ticket = verifyConsentTicket(ticketText);
  } catch {
    return NextResponse.json({ error: "server_error", error_description: "assinatura OAuth não configurada" }, { status: 503 });
  }
  if (!ticket || ticket.sub !== user.id) {
    return NextResponse.json({ error: "invalid_request", error_description: "consentimento inválido ou expirado" }, { status: 400 });
  }

  const { client_id: clientId, redirect_uri: redirectUri, resource, code_challenge: codeChallenge, state } = ticket;
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

  const requestedScope = normalizeScopes(ticket.scope, { allowWrite: true });
  const requestedWrite = requestedScope.split(/\s+/).includes("mcp:write");
  const explicitlyAllowedWrite = form.get("allow_write") === "mcp:write";
  const scope = requestedWrite && explicitlyAllowedWrite
    ? normalizeScopes(requestedScope, { allowWrite: true })
    : "mcp:read";
  const writeConsentedAt = scope.split(/\s+/).includes("mcp:write") ? new Date() : null;

  try {
    const grant = await createGrant({
      userId: user.id,
      clientId,
      redirectUri,
      scope,
      writeConsentedAt,
    });
    const issued = issueAuthorizationCode({
      userId: user.id,
      clientId,
      redirectUri,
      resource,
      scope: grant.scope,
      codeChallenge,
      grantId: grant.grantId,
      allowWrite: grant.scope.split(/\s+/).includes("mcp:write"),
    });
    await storeAuthCode({
      jti: issued.jti,
      grantId: grant.grantId,
      userId: user.id,
      clientId,
      redirectUri,
      scope: grant.scope,
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
