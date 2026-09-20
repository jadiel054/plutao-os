import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { beginOAuth } from "@/lib/connectors/service";
import {
  isOAuthConfigured,
  getAppBaseUrl,
  buildAuthorizeUrl,
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

  if (manifest.authMode !== "oauth" || !manifest.oauth) {
    return NextResponse.json(
      { error: `Conector '${manifest.displayName}' não utiliza autenticação OAuth.` },
      { status: 400 }
    );
  }

  if (!isOAuthConfigured(provider)) {
    return NextResponse.json(
      {
        error: `OAuth não configurado para ${manifest.displayName}. Defina as variáveis de ambiente necessárias.`,
      },
      { status: 400 }
    );
  }

  try {
    const baseUrl = getAppBaseUrl(req.url);
    const redirectUri = `${baseUrl}/api/connectors/${provider}/callback`;
    const { state } = await beginOAuth(user.id, provider);
    const authorizeUrl = buildAuthorizeUrl(provider, { state, redirectUri });

    return NextResponse.json({ authorizeUrl });
  } catch (e) {
    console.error(`[${provider} authorize]`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : `Falha ao iniciar OAuth para ${manifest.displayName}` },
      { status: 500 }
    );
  }
}
