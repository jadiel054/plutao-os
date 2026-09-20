import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const baseUrl = process.env.APP_URL || req.nextUrl.origin;

  if (!clientId) {
    return NextResponse.json(
      { error: "GitHub OAuth não configurado. Defina GITHUB_CLIENT_ID e GITHUB_CLIENT_SECRET nas env vars." },
      { status: 500 }
    );
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = `${baseUrl}/api/auth/github/callback`;

  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", clientId);
  githubAuthUrl.searchParams.set("redirect_uri", redirectUri);
  githubAuthUrl.searchParams.set("scope", "user:email read:user");
  githubAuthUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(githubAuthUrl.toString());
  res.cookies.set("github_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });

  return res;
}
