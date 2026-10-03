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
import { CONNECTOR_CATALOG, type ConnectorCapability, type ConnectorPublicView } from "@plutao/domain";
import { githubManifest } from "@/lib/connectors/manifests/github";
import { vercelManifest } from "@/lib/connectors/manifests/vercel";
import { supabaseManifest } from "@/lib/connectors/manifests/supabase";
import { telegramManifest } from "@/lib/connectors/manifests/telegram";
import { cloudflareManifest } from "@/lib/connectors/manifests/cloudflare";
import { renderManifest } from "@/lib/connectors/manifests/render";
import {
  detectAndExecuteGitHubTool,
  type GitHubToolExecutionResult,
} from "@/lib/chat/githubToolRunner";
import {
  detectAndExecuteVercelTool,
  type VercelToolExecutionResult,
} from "@/lib/chat/vercelToolRunner";
import {
  detectAndExecuteSupabaseTool,
  type SupabaseToolExecutionResult,
} from "@/lib/chat/supabaseToolRunner";
import {
  detectAndExecuteTelegramTool,
  type TelegramToolExecutionResult,
} from "@/lib/chat/telegramToolRunner";
import {
  detectAndExecuteCloudflareTool,
  type CloudflareToolExecutionResult,
} from "@/lib/chat/cloudflareToolRunner";
import {
  detectAndExecuteRenderTool,
  type RenderToolExecutionResult,
} from "@/lib/chat/renderToolRunner";
import {
  detectAndExecuteGenericTool,
  type GenericToolExecutionResult,
} from "@/lib/chat/genericToolRunner";
import {
  detectAndExecuteExportTool,
  type ExportToolExecutionResult,
} from "@/lib/chat/exportToolRunner";

export type ConnectorRuntimeSnapshot = {
  connectors: ConnectorPublicView[];
  systemBlock: string;
  githubConnected: boolean;
  githubLogin: string | null;
  vercelConnected: boolean;
  vercelLogin: string | null;
  vercelToken: string | null;
  supabaseConnected: boolean;
  telegramConnected: boolean;
  cloudflareConnected: boolean;
  renderConnected: boolean;
};

export type ConnectorToolRunResult = {
  github: GitHubToolExecutionResult;
  vercel: VercelToolExecutionResult;
  supabase?: SupabaseToolExecutionResult;
  telegram?: TelegramToolExecutionResult;
  cloudflare?: CloudflareToolExecutionResult;
  render?: RenderToolExecutionResult;
  generic?: GenericToolExecutionResult;
  exportTool?: ExportToolExecutionResult;
  contextBlocks: string[];
  suggestedFollowUps: Array<{ id: string; label: string; prompt: string }>;
};

/** Merge persisted caps with manifest (so write actions appear even before reconnect). */
function enrichCapabilities(
  provider: string,
  status: string,
  stored: ConnectorCapability[]
): ConnectorCapability[] {
  if (status !== "connected") return stored;
  const manifest =
    provider === "github"
      ? githubManifest
      : provider === "vercel"
        ? vercelManifest
        : provider === "supabase"
          ? supabaseManifest
          : provider === "telegram"
            ? telegramManifest
            : provider === "cloudflare"
              ? cloudflareManifest
              : provider === "render"
                ? renderManifest
                : null;
  if (!manifest) return stored;
  const byName = new Map(stored.map((c) => [c.name, c]));
  for (const m of manifest.capabilities) {
    if (!byName.has(m.name)) {
      byName.set(m.name, {
        name: m.name,
        description: m.description,
        kind: "rest_api",
        mode: m.mode,
      });
    }
  }
  return Array.from(byName.values());
}

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

  connectors = connectors.map((c) => ({
    ...c,
    capabilities: enrichCapabilities(c.provider, c.status, c.capabilities),
  }));

  let githubConnected = false;
  let githubLogin: string | null = null;
  let vercelConnected = false;
  let vercelLogin: string | null = null;
  let vercelToken: string | null = null;
  let supabaseConnected = false;
  let telegramConnected = false;
  let cloudflareConnected = false;
  let renderConnected = false;

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
    const rndTok = await getAccessToken(userId, "render");
    renderConnected = Boolean(rndTok);
  } catch {
    /* migration pending */
  }

  try {
    const cfTok = await getAccessToken(userId, "cloudflare");
    cloudflareConnected = Boolean(cfTok);
  } catch {
    /* migration pending */
  }

  try {
    const tgTok = await getAccessToken(userId, "telegram");
    telegramConnected = Boolean(tgTok);
  } catch {
    /* migration pending */
  }

  try {
    const sbTok = await getAccessToken(userId, "supabase");
    supabaseConnected = Boolean(sbTok);
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
    "FERRAMENTAS NATIVAS DE EXPORTAÇÃO (sempre disponíveis, gravam em /exports/ no filesystem do usuário):",
    "- files.export_pdf: { filename, title, content } -> gera arquivo PDF real",
    "- files.export_xlsx: { filename, sheets: [{ name, rows }] } -> gera planilha Excel real",
    "- files.export_markdown: { filename, content, title, origin } -> gera arquivo Markdown com frontmatter",
    "- files.export_html: { filename, title, content } -> gera documento HTML autônomo estilizado",
    "",
    "CONECTORES (fonte de verdade — não invente status):",
    "Para cada provedor: se está no catálogo, se está CONECTADO, conta, e o que você PODE fazer (capabilities).",
    "Só execute tools de conectores com status CONECTADO. Se desconectado, oriente Configurações → Conectores.",
    "",
    "ESCRITAS E APROVAÇÃO HUMANA (Princípio 1):",
    "- Capabilities mode=write (ex.: repo_create, push_files, project_create, deploy_create) existem e são executáveis quando o conector está connected.",
    "- O runtime cria write_gate e o chat mostra o card Aprovar/Recusar. Essa é a única confirmação humana.",
    "- NÃO peça 'confirma no chat' / 'posso prosseguir?' para escritas. NÃO diga que só tem leitura se write estiver na lista.",
    "- NÃO ofereça guia manual ou CLI no lugar de usar a tool.",
    "- Intenção natural do usuário (ex.: criar site, criar repo, publicar no Vercel) deve mapear para as tools disponíveis nesta sessão.",
    "- Fluxo típico de site/app: GitHub (repo_create + push_files) → Vercel (project_create / deploy_create) com gates em cada write.",
  ];

  for (const c of connectors) {
    const caps =
      c.capabilities.length > 0
        ? c.capabilities
            .map(
              (cap) =>
                `${cap.name}[${cap.mode}]${cap.description ? ` (${cap.description})` : ""}`
            )
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
    supabaseConnected,
    telegramConnected,
    cloudflareConnected,
    renderConnected,
  };
}

export async function runConnectedConnectorTools(opts: {
  userId: string;
  userText: string;
  missionId?: string | null;
  snapshot: ConnectorRuntimeSnapshot;
}): Promise<ConnectorToolRunResult> {
  const { userId, userText, missionId, snapshot } = opts;

  let github: GitHubToolExecutionResult = { executed: false };
  let vercel: VercelToolExecutionResult = { executed: false };
  let supabase: SupabaseToolExecutionResult = { executed: false };
  let telegram: TelegramToolExecutionResult = { executed: false };
  let cloudflare: CloudflareToolExecutionResult = { executed: false };
  let render: RenderToolExecutionResult = { executed: false };
  let generic: GenericToolExecutionResult = { executed: false };
  let exportTool: ExportToolExecutionResult = { executed: false };
  const contextBlocks: string[] = [];

  exportTool = await detectAndExecuteExportTool({
    text: userText,
    userId,
    missionId: missionId ?? null,
  });
  if (exportTool.executed && exportTool.contextText) {
    contextBlocks.push(exportTool.contextText);
  }

  if (snapshot.githubConnected) {
    try {
      github = await detectAndExecuteGitHubTool({
        text: userText,
        userId,
        githubLogin: snapshot.githubLogin,
        missionId: missionId ?? null,
      });
      if ((github.executed || github.missingArgs) && github.contextText) {
        contextBlocks.push(github.contextText);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[runConnectedConnectorTools github error]", err);
      github = {
        executed: true,
        capability: "github",
        contextText: `[ERRO NA FERRAMENTA GITHUB]\nNão consegui iniciar a operação GitHub: ${errMsg}\nInforme este erro de forma clara ao usuário.`,
      };
      if (github.contextText) contextBlocks.push(github.contextText);
    }
  }

  if (snapshot.vercelConnected && snapshot.vercelToken) {
    try {
      vercel = await detectAndExecuteVercelTool({
        text: userText,
        userText,
        userId,
        accessToken: snapshot.vercelToken,
        accountLogin: snapshot.vercelLogin,
        missionId: missionId ?? null,
      });
      if ((vercel.executed || vercel.missingArgs) && vercel.contextText) {
        contextBlocks.push(vercel.contextText);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[runConnectedConnectorTools vercel error]", err);
      vercel = {
        executed: true,
        capability: "vercel",
        contextText: `[ERRO NA FERRAMENTA VERCEL]\nNão consegui iniciar a operação Vercel: ${errMsg}\nInforme este erro de forma clara ao usuário.`,
      };
      if (vercel.contextText) contextBlocks.push(vercel.contextText);
    }
  }

  if (snapshot.supabaseConnected) {
    try {
      supabase = await detectAndExecuteSupabaseTool({
        text: userText,
        userId,
        missionId: missionId ?? null,
      });
      if ((supabase.executed || supabase.missingArgs) && supabase.contextText) {
        contextBlocks.push(supabase.contextText);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[runConnectedConnectorTools supabase error]", err);
      supabase = {
        executed: true,
        capability: "supabase",
        contextText: `[ERRO NA FERRAMENTA SUPABASE]\nNão consegui iniciar a operação Supabase: ${errMsg}\nInforme este erro de forma clara ao usuário.`,
      };
      if (supabase.contextText) contextBlocks.push(supabase.contextText);
    }
  }

  if (snapshot.telegramConnected) {
    try {
      telegram = await detectAndExecuteTelegramTool({
        text: userText,
        userId,
        missionId: missionId ?? null,
      });
      if ((telegram.executed || telegram.missingArgs) && telegram.contextText) {
        contextBlocks.push(telegram.contextText);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[runConnectedConnectorTools telegram error]", err);
      telegram = {
        executed: true,
        capability: "telegram",
        contextText: `[ERRO NA FERRAMENTA TELEGRAM]\nNão consegui iniciar a operação Telegram: ${errMsg}\nInforme este erro de forma clara ao usuário.`,
      };
      if (telegram.contextText) contextBlocks.push(telegram.contextText);
    }
  }

  if (snapshot.cloudflareConnected) {
    try {
      cloudflare = await detectAndExecuteCloudflareTool({
        text: userText,
        userId,
        missionId: missionId ?? null,
      });
      if ((cloudflare.executed || cloudflare.missingArgs) && cloudflare.contextText) {
        contextBlocks.push(cloudflare.contextText);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[runConnectedConnectorTools cloudflare error]", err);
      cloudflare = {
        executed: true,
        capability: "cloudflare",
        contextText: `[ERRO NA FERRAMENTA CLOUDFLARE]\nNão consegui iniciar a operação Cloudflare: ${errMsg}\nInforme este erro de forma clara ao usuário.`,
      };
      if (cloudflare.contextText) contextBlocks.push(cloudflare.contextText);
    }
  }

  if (snapshot.renderConnected) {
    try {
      render = await detectAndExecuteRenderTool({
        text: userText,
        userId,
        missionId: missionId ?? null,
      });
      if ((render.executed || render.missingArgs) && render.contextText) {
        contextBlocks.push(render.contextText);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[runConnectedConnectorTools render error]", err);
      render = {
        executed: true,
        capability: "render",
        contextText: `[ERRO NA FERRAMENTA RENDER]\nNão consegui iniciar a operação Render: ${errMsg}\nInforme este erro de forma clara ao usuário.`,
      };
      if (render.contextText) contextBlocks.push(render.contextText);
    }
  }

  if (!github.executed && !vercel.executed && !supabase.executed && !telegram.executed && !cloudflare.executed && !render.executed) {
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
  if (supabase.suggestedFollowUps) {
    suggestedFollowUps.push(...supabase.suggestedFollowUps);
  }
  if (telegram.suggestedFollowUps) {
    suggestedFollowUps.push(...telegram.suggestedFollowUps);
  }
  if (cloudflare.suggestedFollowUps) {
    suggestedFollowUps.push(...cloudflare.suggestedFollowUps);
  }
  if (render.suggestedFollowUps) {
    suggestedFollowUps.push(...render.suggestedFollowUps);
  }
  if (generic.suggestedFollowUps) {
    suggestedFollowUps.push(...generic.suggestedFollowUps);
  }

  return { github, vercel, supabase, telegram, cloudflare, render, generic, exportTool, contextBlocks, suggestedFollowUps };
}
