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
import { getPlanDefinition } from "@plutao/domain";
import { getDb } from "@/lib/db";
import { users, connectors } from "@plutao/db";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> | { provider: string } }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const db = getDb();
  const userRows = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const planDef = getPlanDefinition(userRows[0]?.plan);

  const connectedRows = await db
    .select({ provider: connectors.provider })
    .from(connectors)
    .where(and(eq(connectors.userId, user.id), eq(connectors.status, "connected")));

  const resolvedParams = await context.params;
  const provider = resolvedParams.provider as ConnectorProviderId;

  const isAlreadyConnected = connectedRows.some((c) => c.provider === provider);
  if (!isAlreadyConnected && connectedRows.length >= planDef.connectorsMax) {
    return NextResponse.json(
      {
        error: `Seu plano ${planDef.label} permite no máximo ${planDef.connectorsMax} conector(es) ativo(s). Faça upgrade para o plano Caronte para conectar mais.`,
      },
      { status: 403 }
    );
  }

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
