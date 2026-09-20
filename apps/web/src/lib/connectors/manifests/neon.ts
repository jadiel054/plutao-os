import type { ConnectorManifest } from "./types";

export const neonManifest: ConnectorManifest = {
  provider: "neon",
  displayName: "Neon",
  description:
    "Postgres serverless: projetos, branches e bancos de dados da sua conta Neon. API Key pessoal cifrada.",
  category: "desenvolvedores",
  authMode: "token",
  baseUrl: "https://console.neon.tech/api/v2",
  defaultServerUrl: "https://console.neon.tech/api/v2",
  headers: (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  }),
  tokenConfig: {
    url: "https://console.neon.tech/app/settings/profile",
    label: "API Key da Neon",
    placeholder: "API Key (ex: npg_...)",
    verifyUrl: "https://console.neon.tech/api/v2/projects",
    extractUserLogin: (data: unknown) => {
      const obj = data as Record<string, unknown>;
      const projects = Array.isArray(obj.projects) ? obj.projects : [];
      if (projects.length > 0) {
        const p = projects[0] as Record<string, unknown>;
        return String(p.owner_id || p.name || "neon-user");
      }
      return "neon-user";
    },
  },
  capabilities: [
    {
      name: "projects_list",
      description: "Listar projetos da conta Neon",
      mode: "read",
      request: {
        method: "GET",
        path: "/projects",
      },
      requiredArgs: [],
      intentKeywords: ["projeto neon", "projetos neon", "neon project", "neon projects", "neon"],
      summary: {
        limit: 10,
        pick: ["id", "name", "region_id", "created_at"],
        customFormatter: (data: unknown) => {
          const obj = data as Record<string, unknown>;
          const list = Array.isArray(obj.projects) ? obj.projects : Array.isArray(data) ? data : [];
          if (list.length === 0) return "Nenhum projeto encontrado na conta Neon.";
          const lines = list.map((p, i) => {
            const row = p as Record<string, unknown>;
            return `${i + 1}. **${row.name ?? row.id}**\n   id: \`${row.id}\` · região: ${row.region_id ?? "—"}`;
          });
          return `Projetos Neon (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
    {
      name: "branches_list",
      description: "Listar branches de um projeto Neon",
      mode: "read",
      request: {
        method: "GET",
        path: "/projects/{projectId}/branches",
      },
      requiredArgs: ["projectId"],
      intentKeywords: ["branch neon", "branches neon", "branch do neon"],
      summary: {
        limit: 10,
        pick: ["id", "name", "primary", "created_at"],
        customFormatter: (data: unknown) => {
          const obj = data as Record<string, unknown>;
          const list = Array.isArray(obj.branches) ? obj.branches : Array.isArray(data) ? data : [];
          if (list.length === 0) return "Nenhuma branch encontrada para este projeto Neon.";
          const lines = list.map((b, i) => {
            const row = b as Record<string, unknown>;
            return `${i + 1}. **${row.name ?? row.id}** ${row.primary ? "(primary)" : ""}\n   id: \`${row.id}\``;
          });
          return `Branches Neon (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
    {
      name: "databases_list",
      description: "Listar bancos de dados de uma branch Neon",
      mode: "read",
      request: {
        method: "GET",
        path: "/projects/{projectId}/branches/{branchId}/databases",
      },
      requiredArgs: ["projectId", "branchId"],
      intentKeywords: ["database neon", "databases neon", "banco neon", "bancos neon"],
      summary: {
        limit: 10,
        pick: ["id", "name", "owner_name"],
        customFormatter: (data: unknown) => {
          const obj = data as Record<string, unknown>;
          const list = Array.isArray(obj.databases) ? obj.databases : Array.isArray(data) ? data : [];
          if (list.length === 0) return "Nenhum banco de dados encontrado nesta branch.";
          const lines = list.map((d, i) => {
            const row = d as Record<string, unknown>;
            return `${i + 1}. **${row.name ?? row.id}** · owner: ${row.owner_name ?? "—"}`;
          });
          return `Bancos de dados Neon (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
  ],
};
