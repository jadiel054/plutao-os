import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  isRedirectUriAllowed,
  issueAuthorizationCode,
  normalizeScopes,
} from "@/lib/mcp/tokens";

export const runtime = "nodejs";

/**
 * Após o usuário aprovar na UI /oauth/consent.
 * Emite authorization code e redireciona ao client (nunca envia access token no redirect).
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

  let code: string;
  try {
    code = issueAuthorizationCode({
      userId: user.id,
      clientId,
      redirectUri,
      scope,
      codeChallenge,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "server_error", error_description: e instanceof Error ? e.message : "token secret missing" },
      { status: 503 }
    );
  }

  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);
  return NextResponse.redirect(redirect.toString());
}
