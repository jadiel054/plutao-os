import type { ConnectorManifest } from "./types";

export const vercelManifest: ConnectorManifest = {
  provider: "vercel",
  displayName: "Vercel",
  description:
    "Projetos, deployments e logs. Integration OAuth oficial ou Access Token de escopo mínimo; token cifrado, nunca no chat.",
  category: "desenvolvedores",
  featured: true,
  authMode: "oauth",
  baseUrl: "https://api.vercel.com",
  defaultServerUrl: "https://api.vercel.com",
  headers: (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  }),
  oauth: {
    clientIdEnv: "VERCEL_CLIENT_ID",
    clientSecretEnv: "VERCEL_CLIENT_SECRET",
    authorizeUrl: "https://vercel.com/integrations/token",
    authorizeParams: (redirectUri, state) => ({
      client_id: process.env.VERCEL_CLIENT_ID?.trim() || "",
      redirect_uri: redirectUri,
      state,
    }),
    tokenUrl: "https://api.vercel.com/v2/oauth/access_token",
    tokenFormat: "urlencoded",
    userinfoUrl: "https://api.vercel.com/v2/user",
    extractUserLogin: (data: unknown) => {
      const obj = data as Record<string, unknown>;
      const user = (obj.user ?? obj) as Record<string, unknown>;
      return String(user.username || user.email || user.id || "vercel-user");
    },
  },
  tokenConfig: {
    url: "https://vercel.com/account/tokens",
    label: "Vercel Access Token",
    placeholder: "Access Token",
    verifyUrl: "https://api.vercel.com/v2/user",
    extractUserLogin: (data: unknown) => {
      const obj = data as Record<string, unknown>;
      const user = (obj.user ?? obj) as Record<string, unknown>;
      return String(user.username || user.email || user.id || "vercel-user");
    },
  },
  capabilities: [
    {
      name: "projects_list",
      description: "Listar projetos",
      mode: "read",
      request: {
        method: "GET",
        path: "/v9/projects",
        query: { limit: "{limit}" },
      },
      requiredArgs: [],
      intentKeywords: ["projeto", "projetos", "project", "projects"],
      summary: {
        limit: 12,
        customFormatter: (data: unknown) => {
          const root = data as { projects?: unknown[] };
          const list = Array.isArray(root.projects) ? root.projects : Array.isArray(data) ? data : [];
          if (list.length === 0) return "Nenhum projeto encontrado nesta conta Vercel.";
          const lines = list.slice(0, 20).map((p, i) => {
            const row = p as Record<string, unknown>;
            const name = String(row.name ?? row.id ?? "?");
            const id = String(row.id ?? "");
            const framework = row.framework ? String(row.framework) : "—";
            const updated = row.updatedAt ? String(row.updatedAt) : "";
            return `${i + 1}. **${name}**\n   id: \`${id}\` · framework: ${framework}${updated ? ` · updated: ${updated}` : ""}`;
          });
          return `Projetos Vercel (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
    {
      name: "deployments_list",
      description: "Listar deployments",
      mode: "read",
      request: {
        method: "GET",
        path: "/v6/deployments",
        query: { limit: "{limit}", projectId: "{projectId}" },
      },
      requiredArgs: [],
      intentKeywords: ["deployment", "deployments", "deploy", "deploys"],
      summary: {
        limit: 12,
        customFormatter: (data: unknown) => {
          const root = data as { deployments?: unknown[] };
          const list = Array.isArray(root.deployments) ? root.deployments : [];
          if (list.length === 0) return "Nenhum deployment encontrado.";
          const lines = list.slice(0, 15).map((d, i) => {
            const row = d as Record<string, unknown>;
            const uid = String(row.uid ?? row.id ?? "?");
            const name = String(row.name ?? "");
            const state = String(row.state ?? row.readyState ?? "?");
            const url = row.url ? `https://${row.url}` : "";
            return `${i + 1}. **${name || uid}** · ${state}${url ? `\n   ${url}` : ""}\n   id: \`${uid}\``;
          });
          return `Deployments (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
    {
      name: "deployment_get",
      description: "Detalhes de um deployment",
      mode: "read",
      request: {
        method: "GET",
        path: "/v13/deployments/{deploymentId}",
      },
      requiredArgs: ["deploymentId"],
      intentKeywords: ["detalhe deployment", "detalhes deployment", "info deployment"],
      summary: {
        customFormatter: (data: unknown) => {
          const row = data as Record<string, unknown>;
          return [
            `Deployment \`${row.uid ?? row.id}\``,
            `Nome: ${row.name ?? "—"}`,
            `Estado: ${row.readyState ?? row.state ?? "—"}`,
            row.url ? `URL: https://${row.url}` : null,
            row.createdAt ? `Criado: ${row.createdAt}` : null,
          ]
            .filter(Boolean)
            .join("\n");
        },
      },
    },
  ],
};
