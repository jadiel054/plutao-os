import type { ConnectorManifest } from "./types";

export const renderManifest: ConnectorManifest = {
  provider: "render",
  displayName: "Render",
  description:
    "Serviços, deploys e variáveis de ambiente na nuvem Render via API Key cifrada.",
  category: "desenvolvedores",
  featured: false,
  authMode: "token",
  baseUrl: "https://api.render.com/v1",
  headers: (token: string) => ({
    Authorization: `Bearer ${token.trim()}`,
    Accept: "application/json",
  }),
  tokenConfig: {
    url: "https://dashboard.render.com/user/settings#api-keys",
    label: "Render API Key",
    placeholder: "rnd_...",
    helperText: "dashboard.render.com → Account Settings → API Keys",
    verifyUrl: "https://api.render.com/v1/owners",
    extractUserLogin: (data: unknown) => {
      const list = Array.isArray(data) ? data : [];
      const first = (list[0] ?? data) as Record<string, unknown>;
      const owner = (first?.owner ?? first) as Record<string, unknown>;
      return String(owner?.name || owner?.email || owner?.id || "render-user");
    },
  },
  capabilities: [
    {
      name: "services_list",
      description: "Listar serviços da conta Render (nome, tipo, repo, url live, status)",
      mode: "read",
      request: {
        method: "GET",
        path: "/v1/services",
        query: { limit: "{limit}" },
      },
      requiredArgs: [],
      intentKeywords: ["serviços render", "servicos render", "services render", "listar serviços", "listar servicos"],
    },
    {
      name: "service_get",
      description: "Detalhes de um serviço e chaves de variáveis de ambiente (sem valores)",
      mode: "read",
      request: {
        method: "GET",
        path: "/v1/services/{service_id}",
      },
      requiredArgs: ["service_id"],
      intentKeywords: ["detalhes serviço", "detalhes servico", "info serviço", "info servico", "service get"],
    },
    {
      name: "deploys_list",
      description: "Listar últimos 20 deploys de um serviço (status, commit, data)",
      mode: "read",
      request: {
        method: "GET",
        path: "/v1/services/{service_id}/deploys",
        query: { limit: "20" },
      },
      requiredArgs: ["service_id"],
      intentKeywords: ["deploys render", "listar deploys", "deploys do serviço", "deploys do servico"],
    },
    {
      name: "deploy_trigger",
      description: "Disparar novo deploy de um serviço (requer aprovação humana)",
      mode: "write",
      request: {
        method: "POST",
        path: "/v1/services/{service_id}/deploys",
      },
      requiredArgs: ["service_id"],
      intentKeywords: ["disparar deploy", "trigger deploy", "fazer deploy render", "novo deploy render"],
    },
    {
      name: "env_set",
      description: "Definir variável de ambiente de um serviço (requer aprovação humana)",
      mode: "write",
      request: {
        method: "PUT",
        path: "/v1/services/{service_id}/env-vars",
      },
      requiredArgs: ["service_id", "key", "value"],
      intentKeywords: ["definir env", "set env", "variável de ambiente", "variavel de ambiente", "env set"],
    },
  ],
};
