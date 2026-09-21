import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  isRedirectUriAllowed,
  issueAuthorizationCode,
  normalizeScopes,
} from "@/lib/mcp/tokens";
import { createGrant, storeAuthCode } from "@/lib/mcp/grants";

export const runtime = "nodejs";

/**
 * Após o usuário aprovar na UI /oauth/consent.
 * Cria grant persistido, emite authorization code single-use e redireciona ao client.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "login_required" }, { status: 401 });
  }

  const form = await req.formData();
  const decision = String(form.get("decision") || "");
  const clientId = String(form.get("client_id") || "").trim();
  const redirectUri = String(form.get("redirect_uri") || "").trim();
  const scope = normalizeScopes(String(form.get("scope") || "mcp:read"));
  const codeChallenge = String(form.get("code_challenge") || "").trim();
  const state = String(form.get("state") || "");

  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!isRedirectUriAllowed(redirectUri)) {
    return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }

  const redirect = new URL(redirectUri);

  if (decision !== "approve") {
    redirect.searchParams.set("error", "access_denied");
    if (state) redirect.searchParams.set("state", state);
    return NextResponse.redirect(redirect.toString());
  }

  try {
    const { grantId } = await createGrant({
      userId: user.id,
      clientId,
      redirectUri,
      scope,
    });
    const issued = issueAuthorizationCode({
      userId: user.id,
      clientId,
      redirectUri,
      scope,
      codeChallenge,
      grantId,
    });
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
    return NextResponse.redirect(redirect.toString());
  } catch (e) {
    return NextResponse.json(
      {
        error: "server_error",
        error_description: e instanceof Error ? e.message : "token secret or db missing",
      },
      { status: 503 }
    );
  }
}
