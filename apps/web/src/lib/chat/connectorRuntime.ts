/**
 * Runtime de conectores para o chat.
 * O modelo consulta: disponível no catálogo? conectado? capacidades/permissões?
 * Só tools de conectores CONNECTED são executáveis.
 */

import {
  listConnectorsForUser,
  getAccessToken,
  getConnectorRow,
} from "@/lib/connectors/service";
import { CONNECTOR_CATALOG, type ConnectorPublicView } from "@plutao/domain";
import {
  detectAndExecuteGitHubTool,
  type GitHubToolExecutionResult,
} from "@/lib/chat/githubToolRunner";
import {
  detectAndExecuteVercelTool,
  type VercelToolExecutionResult,
} from "@/lib/chat/vercelToolRunner";
import {
  detectAndExecuteGenericTool,
  type GenericToolExecutionResult,
} from "@/lib/chat/genericToolRunner";

export type ConnectorRuntimeSnapshot = {
  connectors: ConnectorPublicView[];
  systemBlock: string;
  githubConnected: boolean;
  githubLogin: string | null;
  vercelConnected: boolean;
  vercelLogin: string | null;
  vercelToken: string | null;
};

export type ConnectorToolRunResult = {
  github: GitHubToolExecutionResult;
  vercel: VercelToolExecutionResult;
  generic?: GenericToolExecutionResult;
  contextBlocks: string[];
  suggestedFollowUps: Array<{ id: string; label: string; prompt: string }>;
};

/**
 * Carrega catálogo + estado real do usuário.
 * Fonte de verdade — o modelo não inventa conector conectado.
 */
export async function loadConnectorRuntime(
  userId: string
): Promise<ConnectorRuntimeSnapshot> {
  let connectors: ConnectorPublicView[] = [];
  try {
    connectors = await listConnectorsForUser(userId);
  } catch {
    connectors = CONNECTOR_CATALOG.map((c) => ({
      id: `catalog-${c.provider}`,
      provider: c.provider,
      displayName: c.displayName,
      status: "disconnected" as const,
      serverUrl: c.defaultServerUrl,
      accountLogin: null,
      accountLabel: null,
      capabilities: [],
      scopes: c.defaultScopes,
      lastError: null,
      connectedAt: null,
      updatedAt: new Date().toISOString(),
    }));
  }

  let githubConnected = false;
  let githubLogin: string | null = null;
  let vercelConnected = false;
  let vercelLogin: string | null = null;
  let vercelToken: string | null = null;

  try {
    const ghTok = await getAccessToken(userId, "github");
    githubConnected = Boolean(ghTok);
    if (githubConnected) {
      const row = await getConnectorRow(userId, "github");
      githubLogin = row?.accountLogin ?? null;
    }
  } catch {
    /* migration pending */
  }

  try {
    vercelToken = await getAccessToken(userId, "vercel");
    vercelConnected = Boolean(vercelToken);
    if (vercelConnected) {
      const row = await getConnectorRow(userId, "vercel");
      vercelLogin = row?.accountLogin ?? null;
    }
  } catch {
    /* migration pending */
  }

  const lines: string[] = [
    "CONECTORES (fonte de verdade — não invente status):",
    "Para cada provedor: se está no catálogo, se está CONECTADO, conta, e o que você PODE fazer (capabilities).",
    "Só execute tools de conectores com status CONECTADO. Se desconectado, oriente Configurações → Conectores.",
  ];

  for (const c of connectors) {
    const caps =
      c.capabilities.length > 0
        ? c.capabilities
            .map((cap) => `${cap.name}${cap.description ? ` (${cap.description})` : ""}`)
            .join("; ")
        : "(sem capabilities listadas)";
    const scopes = c.scopes.length > 0 ? c.scopes.join(", ") : "—";
    const account = c.accountLogin ? `@${c.accountLogin}` : c.accountLabel || "—";
    lines.push(
      `- ${c.displayName} [${c.provider}]: status=${c.status}; conta=${account}; scopes/permissões=${scopes}; capabilities=${caps}`
    );
  }

  const present = new Set(connectors.map((c) => c.provider));
  for (const entry of CONNECTOR_CATALOG) {
    if (!present.has(entry.provider)) {
      lines.push(
        `- ${entry.displayName} [${entry.provider}]: status=disconnected; conta=—; capabilities=(conecte para habilitar)`
      );
    }
  }

  return {
    connectors,
    systemBlock: lines.join("\n"),
    githubConnected,
    githubLogin,
    vercelConnected,
    vercelLogin,
    vercelToken,
  };
}

/**
 * Executa tools dos conectores CONNECTED conforme a intenção do usuário.
 */
export async function runConnectedConnectorTools(opts: {
  userId: string;
  userText: string;
  missionId?: string | null;
  snapshot: ConnectorRuntimeSnapshot;
}): Promise<ConnectorToolRunResult> {
  const { userId, userText, missionId, snapshot } = opts;

  let github: GitHubToolExecutionResult = { executed: false };
  let vercel: VercelToolExecutionResult = { executed: false };
  let generic: GenericToolExecutionResult = { executed: false };
  const contextBlocks: string[] = [];

  if (snapshot.githubConnected) {
    github = await detectAndExecuteGitHubTool({
      text: userText,
      userId,
      githubLogin: snapshot.githubLogin,
      missionId: missionId ?? null,
    });
    if ((github.executed || github.missingArgs) && github.contextText) {
      contextBlocks.push(github.contextText);
    }
  }

  if (snapshot.vercelConnected && snapshot.vercelToken) {
    vercel = await detectAndExecuteVercelTool({
      text: userText,
      userText,
      accessToken: snapshot.vercelToken,
      accountLogin: snapshot.vercelLogin,
    });
    if ((vercel.executed || vercel.missingArgs) && vercel.contextText) {
      contextBlocks.push(vercel.contextText);
    }
  }

  // If github/vercel runner didn't catch or for other providers (neon, stripe, etc.)
  if (!github.executed && !vercel.executed) {
    generic = await detectAndExecuteGenericTool({
      text: userText,
      userId,
      missionId: missionId ?? null,
    });
    if ((generic.executed || generic.missingArgs) && generic.contextText) {
      contextBlocks.push(generic.contextText);
    }
  }

  const suggestedFollowUps: Array<{ id: string; label: string; prompt: string }> = [];
  if (github.suggestedFollowUps) {
    suggestedFollowUps.push(...github.suggestedFollowUps);
  }
  if (vercel.suggestedFollowUps) {
    suggestedFollowUps.push(...vercel.suggestedFollowUps);
  }
  if (generic.suggestedFollowUps) {
    suggestedFollowUps.push(...generic.suggestedFollowUps);
  }

  return { github, vercel, generic, contextBlocks, suggestedFollowUps };
}
