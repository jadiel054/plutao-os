import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { disconnectConnector } from "@/lib/connectors/service";
import { getConnectorManifest } from "@/lib/connectors/manifests";
import type { ConnectorProviderId } from "@plutao/domain";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
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

  try {
    const res = await disconnectConnector(user.id, provider);
    if ("error" in res) {
      return NextResponse.json({ error: "Conector não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ connector: res.connector });
  } catch (e) {
    console.error(`[${provider} disconnect]`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao desconectar." },
      { status: 500 }
    );
  }
}
