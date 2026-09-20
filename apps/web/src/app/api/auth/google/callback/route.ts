import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserByEmail } from "@/lib/auth/social";
import { createSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_URL || req.nextUrl.origin;
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("google_oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(`${baseUrl}/login?error=OAuthStateInvalid`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/login?error=GoogleOAuthNotConfigured`);
  }

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("[google/callback] Token exchange failed", await tokenRes.text());
      return NextResponse.redirect(`${baseUrl}/login?error=TokenExchangeFailed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch user profile from Google
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(`${baseUrl}/login?error=FetchUserProfileFailed`);
    }

    const profile = await userRes.json();
    const email = profile.email;
    const name = profile.name || profile.given_name || null;

    if (!email) {
      return NextResponse.redirect(`${baseUrl}/login?error=NoEmailProvided`);
    }

    // 3. Link or create user, ensure waitlist inclusion
    const user = await getOrCreateUserByEmail(email, name);

    // 4. Create session and set cookie
    const { token, expiresAt } = await createSession({
      userId: user.id,
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

    const res = NextResponse.redirect(`${baseUrl}/cockpit`);
    await setSessionCookie(token, expiresAt);
    res.cookies.delete("google_oauth_state");

    return res;
  } catch (err) {
    console.error("[google/callback] Unexpected error", err);
    return NextResponse.redirect(`${baseUrl}/login?error=OAuthFailed`);
  }
}
