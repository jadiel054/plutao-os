import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const clientId = process.env.AUTH_GOOGLE_CLIENT_ID;
  const baseUrl = process.env.APP_URL || req.nextUrl.origin;

  if (!clientId) {
    return NextResponse.json(
      { error: "Google OAuth não configurado. Defina AUTH_GOOGLE_CLIENT_ID e AUTH_GOOGLE_CLIENT_SECRET nas env vars." },
      { status: 500 }
    );
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("state", state);
  googleAuthUrl.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(googleAuthUrl.toString());
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });

  return res;
}
