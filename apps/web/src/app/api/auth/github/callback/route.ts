import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserByEmail } from "@/lib/auth/social";
import { createSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";
import { handleGuestMigrationOnAuth } from "@/lib/auth/guest";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_URL || req.nextUrl.origin;
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("github_oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(`${baseUrl}/login?error=OAuthStateInvalid`);
  }

  const clientId = process.env.AUTH_GITHUB_CLIENT_ID;
  const clientSecret = process.env.AUTH_GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/login?error=GitHubOAuthNotConfigured`);
  }

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[github/callback] Token exchange failed", await tokenRes.text());
      return NextResponse.redirect(`${baseUrl}/login?error=TokenExchangeFailed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return NextResponse.redirect(`${baseUrl}/login?error=NoAccessToken`);
    }

    // 2. Fetch user profile from GitHub
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "Plutao-App",
      },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(`${baseUrl}/login?error=FetchUserProfileFailed`);
    }

    const profile = await userRes.json();
    let email = profile.email;
    const name = profile.name || profile.login || null;

    // If primary email is private, fetch email list
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "Plutao-App",
        },
      });

      if (emailsRes.ok) {
        const emails: Array<{ email: string; primary: boolean; verified: boolean }> =
          await emailsRes.json();
        const primaryObj = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
        if (primaryObj) {
          email = primaryObj.email;
        }
      }
    }

    if (!email) {
      return NextResponse.redirect(`${baseUrl}/login?error=NoEmailProvided`);
    }

    // 3. Link or create user, ensure waitlist inclusion
    const user = await getOrCreateUserByEmail(email, name);
    await handleGuestMigrationOnAuth(req, user.id);

    // 4. Create session and set cookie
    const { token, expiresAt } = await createSession({
      userId: user.id,
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

    const res = NextResponse.redirect(`${baseUrl}/cockpit`);
    await setSessionCookie(token, expiresAt);
    res.cookies.delete("github_oauth_state");

    return res;
  } catch (err) {
    console.error("[github/callback] Unexpected error", err);
    return NextResponse.redirect(`${baseUrl}/login?error=OAuthFailed`);
  }
}
