import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  isRedirectUriAllowed,
  normalizeScopes,
} from "@/lib/mcp/tokens";

export const runtime = "nodejs";

/**
 * OAuth 2.1 Authorization Endpoint (authorization code + PKCE S256).
 * Usuário precisa estar logado no Plutão; depois vai à tela de consentimento.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id")?.trim() || "";
  const redirectUri = url.searchParams.get("redirect_uri")?.trim() || "";
  const state = url.searchParams.get("state") || "";
  const scope = normalizeScopes(url.searchParams.get("scope"));
  const codeChallenge = url.searchParams.get("code_challenge")?.trim() || "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "S256";

  if (responseType !== "code") {
    return NextResponse.json({ error: "unsupported_response_type" }, { status: 400 });
  }
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "invalid_request", error_description: "client_id e redirect_uri obrigatórios" }, { status: 400 });
  }
  if (!isRedirectUriAllowed(redirectUri)) {
    return NextResponse.json({ error: "invalid_request", error_description: "redirect_uri não permitido" }, { status: 400 });
  }
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "PKCE S256 obrigatório (code_challenge + code_challenge_method=S256)" },
      { status: 400 }
    );
  }

  const user = await getSessionUser();
  const appUrl = (process.env.APP_URL || url.origin).replace(/\/$/, "");

  if (!user) {
    const returnTo = `${url.pathname}${url.search}`;
    const login = new URL("/login", appUrl);
    login.searchParams.set("next", returnTo);
    return NextResponse.redirect(login.toString());
  }

  const consent = new URL("/oauth/consent", appUrl);
  consent.searchParams.set("client_id", clientId);
  consent.searchParams.set("redirect_uri", redirectUri);
  consent.searchParams.set("scope", scope);
  consent.searchParams.set("code_challenge", codeChallenge);
  consent.searchParams.set("code_challenge_method", "S256");
  if (state) consent.searchParams.set("state", state);

  return NextResponse.redirect(consent.toString());
}
