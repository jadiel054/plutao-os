import type { ConnectorManifest } from "./types";

export const supabaseManifest: ConnectorManifest = {
  provider: "supabase",
  displayName: "Supabase",
  description:
    "Auth, Postgres, storage e edge. Personal Access Token (PAT) do Supabase e par opcional project_url / service_role_key. Cifrados e protegidos.",
  category: "desenvolvedores",
  authMode: "token",
  baseUrl: "https://api.supabase.com",
  defaultServerUrl: "https://api.supabase.com",
  headers: (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  }),
  tokenConfig: {
    url: "https://supabase.com/dashboard/account/tokens",
    label: "Personal Access Token (PAT) do Supabase",
    placeholder: "sbp_...",
    verifyUrl: "https://api.supabase.com/v1/projects",
    extractUserLogin: (data: unknown) => {
      const list = Array.isArray(data) ? data : [];
      if (list.length > 0) {
        const first = list[0] as Record<string, unknown>;
        return String(first.organization_id || first.name || first.ref || "supabase-user");
      }
      return "supabase-user";
    },
  },
  capabilities: [
    {
      name: "projects_list",
      description: "Listar projetos da conta Supabase (nome, ref, região, status)",
      mode: "read",
      request: {
        method: "GET",
        path: "/v1/projects",
      },
      requiredArgs: [],
      intentKeywords: [
        "projeto supabase",
        "projetos supabase",
        "supabase project",
        "supabase projects",
        "supabase",
      ],
      summary: {
        limit: 10,
        customFormatter: (data: unknown) => {
          const list = Array.isArray(data) ? data : [];
          if (list.length === 0) return "Nenhum projeto encontrado na conta Supabase.";
          const lines = list.map((p, i) => {
            const row = p as Record<string, unknown>;
            const name = String(row.name ?? row.id ?? "?");
            const ref = String(row.ref ?? row.id ?? "?");
            const region = String(row.region ?? "—");
            const status = String(row.status ?? "ACTIVE");
            return `${i + 1}. **${name}** (ref: \`${ref}\`)\n   região: ${region} · status: ${status}`;
          });
          return `Projetos Supabase (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
    {
      name: "tables_list",
      description: "Listar tabelas do schema public de um projeto Supabase",
      mode: "read",
      request: {
        method: "GET",
        path: "/v1/projects/{project_ref}/tables",
      },
      requiredArgs: ["project_ref"],
      intentKeywords: [
        "tabelas supabase",
        "tables supabase",
        "lista tabelas",
        "tabelas do schema",
        "tables list",
      ],
      summary: {
        limit: 20,
        customFormatter: (data: unknown) => {
          const list = Array.isArray(data) ? data : [];
          if (list.length === 0) return "Nenhuma tabela encontrada no schema public.";
          const lines = list.map((t, i) => {
            if (typeof t === "string") return `${i + 1}. **${t}**`;
            const row = t as Record<string, unknown>;
            const name = String(row.name ?? row.table_name ?? "?");
            return `${i + 1}. **${name}**`;
          });
          return `Tabelas public (${list.length}):\n${lines.join("\n")}`;
        },
      },
    },
    {
      name: "table_read",
      description: "Consultar dados de uma tabela (SELECT apenas, max 100 linhas)",
      mode: "read",
      request: {
        method: "GET",
        path: "/v1/projects/{project_ref}/tables/{table}/data",
      },
      requiredArgs: ["project_ref", "table"],
      intentKeywords: [
        "ler tabela",
        "table read",
        "select na tabela",
        "dados da tabela",
        "consultar tabela",
      ],
    },
    {
      name: "sql_exec",
      description: "Executar instrução SQL no projeto Supabase (requer aprovação humana)",
      mode: "write",
      request: {
        method: "POST",
        path: "/v1/projects/{project_ref}/database/query",
      },
      requiredArgs: ["project_ref", "query"],
      intentKeywords: [
        "executar sql",
        "sql exec",
        "run sql",
        "query supabase",
        "sql supabase",
      ],
    },
  ],
};
