import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { completeOAuth, ensureConnectorRow, beginOAuth } from "@/lib/connectors/service";
import { canEncryptTokens } from "@/lib/connectors/crypto";
import { verifyVercelToken, vercelDefaultCapabilities } from "@/lib/connectors/vercelOAuth";

export const runtime = "nodejs";

/**
 * POST /api/connectors/vercel/connect-token
 * Body: { token: string } — Access Token de vercel.com/account/tokens
 * Nunca enviar token pelo chat.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!canEncryptTokens()) {
    return NextResponse.json(
      { error: "CRYPTO_NOT_CONFIGURED", code: "CRYPTO_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length < 20) {
    return NextResponse.json({ error: "Token inválido ou muito curto" }, { status: 400 });
  }

  const identity = await verifyVercelToken(token);
  if (!identity.ok) {
    return NextResponse.json({ error: identity.error }, { status: 401 });
  }

  try {
    await ensureConnectorRow(user.id, "vercel");
    const { state } = await beginOAuth(user.id, "vercel");
    const result = await completeOAuth({
      userId: user.id,
      provider: "vercel",
      state,
      accessToken: token,
      accountLogin: identity.login,
      accountLabel: identity.name,
      capabilities: vercelDefaultCapabilities(),
      scopes: [],
    });
    if ("error" in result && result.error) {
      return NextResponse.json(
        { error: typeof result.error === "string" ? result.error : "Falha ao salvar" },
        { status: 500 }
      );
    }
    return NextResponse.json({
      status: "connected",
      accountLogin: identity.login,
      connector: "connector" in result ? result.connector : undefined,
    });
  } catch (e) {
    console.error("[connectors/vercel/connect-token]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao conectar" },
      { status: 500 }
    );
  }
}
