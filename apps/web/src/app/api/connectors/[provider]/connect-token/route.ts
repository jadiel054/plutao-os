import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  beginOAuth,
  completeOAuth,
} from "@/lib/connectors/service";
import {
  verifyToken,
  getDefaultCapabilities,
} from "@/lib/connectors/connectorOAuth";
import { getConnectorManifest } from "@/lib/connectors/manifests";
import type { ConnectorProviderId } from "@plutao/domain";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> | { provider: string } }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const resolvedParams = await context.params;
  const provider = resolvedParams.provider as ConnectorProviderId;
  const manifest = getConnectorManifest(provider);

  if (!manifest) {
    return NextResponse.json({ error: `Conector '${provider}' inválido.` }, { status: 400 });
  }

  if (manifest.authMode !== "token" && !manifest.tokenConfig) {
    return NextResponse.json(
      { error: `Conector '${manifest.displayName}' não suporta conexão via Token.` },
      { status: 400 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    const rawToken = body.token?.trim() || "";

    if (!rawToken || rawToken.length < 5) {
      return NextResponse.json({ error: "Token/API Key inválido." }, { status: 400 });
    }

    const verified = await verifyToken(provider, rawToken);
    if (!verified.ok) {
      return NextResponse.json(
        { error: `Falha ao validar token com ${manifest.displayName}: ${verified.error}` },
        { status: 400 }
      );
    }

    const { state } = await beginOAuth(user.id, provider);
    const capabilities = getDefaultCapabilities(provider);

    const result = await completeOAuth({
      userId: user.id,
      provider,
      state,
      accessToken: rawToken,
      accountLogin: verified.login,
      accountLabel: verified.name || verified.login,
      scopes: [],
      capabilities,
    });

    if ("error" in result) {
      return NextResponse.json({ error: "Falha ao salvar conector." }, { status: 500 });
    }

    return NextResponse.json({
      connector: result.connector,
      accountLogin: verified.login,
    });
  } catch (e) {
    console.error(`[${provider} connect-token]`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : `Falha ao conectar ${manifest.displayName}` },
      { status: 500 }
    );
  }
}
