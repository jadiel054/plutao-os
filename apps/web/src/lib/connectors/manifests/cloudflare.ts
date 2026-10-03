import type { ConnectorManifest } from "./types";

export const cloudflareManifest: ConnectorManifest = {
  provider: "cloudflare",
  displayName: "Cloudflare",
  description:
    "Zones, DNS, Cloudflare Pages e Workers da sua conta Cloudflare via API Token cifrado. Escritas passam por aprovação humana.",
  category: "infra",
  featured: false,
  authMode: "token",
  baseUrl: "https://api.cloudflare.com/client/v4",
  defaultServerUrl: "https://api.cloudflare.com/client/v4",
  headers: (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  }),
  tokenConfig: {
    url: "https://dash.cloudflare.com/profile/api-tokens",
    label: "Cloudflare API Token",
    placeholder: "Cole o API Token do Cloudflare...",
    helperText:
      "Crie em dash.cloudflare.com → My Profile → API Tokens → Edit Cloudflare Workers (template) ou token custom com zones read + pages read",
    verifyUrl: "https://api.cloudflare.com/client/v4/user/tokens/verify",
    extractUserLogin: (data: unknown) => {
      const obj = data as { result?: { id?: string } };
      const id = obj.result?.id;
      return id ? `cf-${id.slice(0, 8)}` : "cloudflare-user";
    },
  },
  capabilities: [
    {
      name: "zones_list",
      description: "Listar zonas/domínios cadastrados na conta (máx 50)",
      mode: "read",
      request: {
        method: "GET",
        path: "/zones",
        query: { per_page: "50" },
      },
      requiredArgs: [],
      intentKeywords: [
        "cloudflare zones",
        "zones cloudflare",
        "dominios cloudflare",
        "zonas cloudflare",
        "listar zones",
        "listar dominios",
      ],
      summary: {
        limit: 50,
        customFormatter: (data: unknown) => {
          const root = data as { result?: unknown[] };
          const list = Array.isArray(root.result) ? root.result : Array.isArray(data) ? data : [];
          if (list.length === 0) return "Nenhuma zona/domínio encontrado nesta conta Cloudflare.";
          const lines = list.slice(0, 50).map((z, i) => {
            const row = z as Record<string, unknown>;
            const name = String(row.name ?? "?");
            const id = String(row.id ?? "");
            const status = String(row.status ?? "ativo");
            return `${i + 1}. **${name}** · status: ${status}\n   id: \`${id}\``;
          });
          return `Zonas/Domínios Cloudflare (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
    {
      name: "dns_records_list",
      description: "Listar registros DNS de uma zona específica (máx 50)",
      mode: "read",
      request: {
        method: "GET",
        path: "/zones/{zone_id}/dns_records",
        query: { per_page: "50" },
      },
      requiredArgs: ["zone_id"],
      intentKeywords: [
        "dns records",
        "registros dns",
        "listar dns",
        "dns cloudflare",
        "registros de dns",
      ],
      summary: {
        limit: 50,
        customFormatter: (data: unknown) => {
          const root = data as { result?: unknown[] };
          const list = Array.isArray(root.result) ? root.result : Array.isArray(data) ? data : [];
          if (list.length === 0) return "Nenhum registro DNS encontrado nesta zona.";
          const lines = list.slice(0, 50).map((r, i) => {
            const row = r as Record<string, unknown>;
            const type = String(row.type ?? "A");
            const name = String(row.name ?? "?");
            const content = String(row.content ?? "");
            const proxied = Boolean(row.proxied);
            const id = String(row.id ?? "");
            return `${i + 1}. **${type}** \`${name}\` → \`${content}\` · proxied: ${proxied ? "sim" : "não"}\n   id: \`${id}\``;
          });
          return `Registros DNS (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
    {
      name: "pages_projects_list",
      description: "Listar projetos do Cloudflare Pages na conta (máx 50)",
      mode: "read",
      request: {
        method: "GET",
        path: "/accounts/{accountId}/pages/projects",
        query: { per_page: "50" },
      },
      requiredArgs: [],
      intentKeywords: [
        "pages projects",
        "cloudflare pages",
        "projetos pages",
        "listar pages",
        "pages cloudflare",
      ],
      summary: {
        limit: 50,
        customFormatter: (data: unknown) => {
          const root = data as { result?: unknown[] };
          const list = Array.isArray(root.result) ? root.result : Array.isArray(data) ? data : [];
          if (list.length === 0) return "Nenhum projeto Pages encontrado na conta.";
          const lines = list.slice(0, 50).map((p, i) => {
            const row = p as Record<string, unknown>;
            const name = String(row.name ?? "?");
            const subdomain = String(row.subdomain ?? `${name}.pages.dev`);
            const created = row.created_on ? String(row.created_on) : "";
            return `${i + 1}. **${name}**\n   url: https://${subdomain}${created ? ` · criado: ${created}` : ""}`;
          });
          return `Projetos Cloudflare Pages (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
    {
      name: "workers_list",
      description: "Listar scripts/workers do Cloudflare Workers na conta (máx 50)",
      mode: "read",
      request: {
        method: "GET",
        path: "/accounts/{accountId}/workers/scripts",
        query: { per_page: "50" },
      },
      requiredArgs: [],
      intentKeywords: [
        "workers list",
        "cloudflare workers",
        "scripts workers",
        "listar workers",
        "workers cloudflare",
      ],
      summary: {
        limit: 50,
        customFormatter: (data: unknown) => {
          const root = data as { result?: unknown[] };
          const list = Array.isArray(root.result) ? root.result : Array.isArray(data) ? data : [];
          if (list.length === 0) return "Nenhum Worker encontrado na conta.";
          const lines = list.slice(0, 50).map((w, i) => {
            const row = w as Record<string, unknown>;
            const id = String(row.id ?? row.name ?? "?");
            const modified = row.modified_on ? String(row.modified_on) : "";
            return `${i + 1}. **${id}**${modified ? ` · modificado: ${modified}` : ""}`;
          });
          return `Workers (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
    {
      name: "dns_record_create",
      description: "Criar novo registro DNS em uma zona (requer aprovação humana)",
      mode: "write",
      request: {
        method: "POST",
        path: "/zones/{zone_id}/dns_records",
      },
      requiredArgs: ["zone_id", "type", "name", "content"],
      intentKeywords: [
        "criar registro dns",
        "novo registro dns",
        "adicionar dns",
        "dns record create",
        "criar dns cloudflare",
      ],
    },
    {
      name: "pages_deploy",
      description: "Criar deployment de projeto do Cloudflare Pages (requer aprovação humana)",
      mode: "write",
      request: {
        method: "POST",
        path: "/accounts/{accountId}/pages/projects/{project_name}/deployments",
      },
      requiredArgs: ["project_name"],
      intentKeywords: [
        "deploy pages",
        "cloudflare pages deploy",
        "publicar pages",
        "pages deploy",
        "deploy cloudflare",
      ],
    },
  ],
};
