import type { ConnectorManifest } from "./types";

export const githubManifest: ConnectorManifest = {
  provider: "github",
  displayName: "GitHub",
  description:
    "Repositórios, issues, pull requests e actions da sua conta. OAuth real; o Executor só usa o que estiver conectado. Escritas passam pelo portão de aprovação humana.",
  category: "desenvolvedores",
  featured: true,
  authMode: "oauth",
  baseUrl: "https://api.github.com",
  // `repo` = full control of private repos (includes create/push). Do not drop without product decision.
  defaultScopes: ["repo", "read:user", "workflow"],
  defaultServerUrl: "https://api.github.com",
  headers: (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Plutao-OS",
  }),
  oauth: {
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    authorizeParams: (redirectUri, state, scopes) => ({
      client_id: process.env.GITHUB_CLIENT_ID?.trim() || "",
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state,
      allow_signup: "false",
    }),
    tokenUrl: "https://github.com/login/oauth/access_token",
    tokenFormat: "json",
    userinfoUrl: "https://api.github.com/user",
    extractUserLogin: (data: unknown) => {
      const obj = data as Record<string, unknown>;
      return String(obj.login ?? "");
    },
  },
  capabilities: [
    {
      name: "repos_list",
      description: "Listar repositórios do usuário",
      mode: "read",
      request: {
        method: "GET",
        path: "/user/repos",
        query: { per_page: "{per_page}", sort: "updated" },
      },
      requiredArgs: [],
      intentKeywords: ["repositório", "repositorios", "repos", "repo"],
      summary: {
        limit: 15,
        customFormatter: (data: unknown) => {
          if (!Array.isArray(data)) return JSON.stringify(data).slice(0, 2000);
          const lines = data.slice(0, 15).map((r) => {
            const o = r as Record<string, unknown>;
            return `- ${o.full_name} (${o.private ? "private" : "public"}) · ${o.default_branch ?? ""}`;
          });
          return `repos (${data.length}${data.length > 15 ? ", showing 15" : ""}):\n${lines.join("\n")}`;
        },
      },
    },
    {
      name: "repo_get",
      description: "Metadados de um repositório",
      mode: "read",
      request: {
        method: "GET",
        path: "/repos/{owner}/{repo}",
      },
      requiredArgs: ["owner", "repo"],
      intentKeywords: ["detalhes", "sobre", "info"],
      summary: {
        customFormatter: (data: unknown) => {
          const o = data as Record<string, unknown>;
          return [
            `repo: ${o.full_name}`,
            `default_branch: ${o.default_branch}`,
            `private: ${o.private}`,
            `description: ${o.description ?? "—"}`,
            `html_url: ${o.html_url}`,
          ].join("\n");
        },
      },
    },
    {
      name: "issues_list",
      description: "Listar issues de um repositório",
      mode: "read",
      request: {
        method: "GET",
        path: "/repos/{owner}/{repo}/issues",
        query: { state: "{state}", per_page: "{per_page}" },
      },
      requiredArgs: ["owner", "repo"],
      intentKeywords: ["issue", "issues"],
      summary: {
        limit: 15,
        customFormatter: (data: unknown) => {
          if (!Array.isArray(data)) return JSON.stringify(data).slice(0, 2000);
          const lines = data.slice(0, 15).map((r) => {
            const o = r as Record<string, unknown>;
            return `- #${o.number} [${o.state}] ${o.title}`;
          });
          return `issues_list (${data.length}):\n${lines.join("\n") || "(vazio)"}`;
        },
      },
    },
    {
      name: "issues_get",
      description: "Obter issue por número",
      mode: "read",
      request: {
        method: "GET",
        path: "/repos/{owner}/{repo}/issues/{number}",
      },
      requiredArgs: ["owner", "repo", "number"],
      intentKeywords: ["issue #", "issue number"],
      summary: {
        customFormatter: (data: unknown) => {
          const o = data as Record<string, unknown>;
          return [
            `#${o.number} [${o.state}] ${o.title}`,
            `user: ${(o.user as { login?: string })?.login ?? "—"}`,
            String(o.body ?? "").slice(0, 800),
          ].join("\n");
        },
      },
    },
    {
      name: "pulls_list",
      description: "Listar pull requests",
      mode: "read",
      request: {
        method: "GET",
        path: "/repos/{owner}/{repo}/pulls",
        query: { state: "{state}", per_page: "{per_page}" },
      },
      requiredArgs: ["owner", "repo"],
      intentKeywords: ["pull", "pr ", "prs", "pull request"],
      summary: {
        limit: 15,
        customFormatter: (data: unknown) => {
          if (!Array.isArray(data)) return JSON.stringify(data).slice(0, 2000);
          const lines = data.slice(0, 15).map((r) => {
            const o = r as Record<string, unknown>;
            return `- #${o.number} [${o.state}] ${o.title}`;
          });
          return `pulls_list (${data.length}):\n${lines.join("\n") || "(vazio)"}`;
        },
      },
    },
    {
      name: "actions_list",
      description: "Listar workflow runs",
      mode: "read",
      request: {
        method: "GET",
        path: "/repos/{owner}/{repo}/actions/runs",
        query: { per_page: "{per_page}" },
      },
      requiredArgs: ["owner", "repo"],
      intentKeywords: ["action", "actions", "workflow", "pipeline"],
      summary: {
        limit: 10,
        customFormatter: (data: unknown) => {
          const o = data as Record<string, unknown>;
          const runs = Array.isArray(o.workflow_runs) ? o.workflow_runs : Array.isArray(data) ? data : [];
          const lines = runs.slice(0, 10).map((r) => {
            const row = r as Record<string, unknown>;
            return `- ${row.name} · ${row.status}/${row.conclusion ?? "—"} · ${row.html_url ?? ""}`;
          });
          return `workflow runs (${runs.length}):\n${lines.join("\n") || "(vazio)"}`;
        },
      },
    },
    // Writes — executed only after write_gate approval (runGithub + /api/gates).
    // Declarative request shape; real execution is in githubWrite.ts (Git Data API).
    {
      name: "repo_create",
      description: "Criar repositório na conta do usuário (requer aprovação humana)",
      mode: "write",
      request: {
        method: "POST",
        path: "/user/repos",
      },
      requiredArgs: ["name"],
      intentKeywords: [
        "criar repositório",
        "criar repo",
        "novo repositório",
        "create repo",
        "create repository",
      ],
    },
    {
      name: "push_files",
      description: "Enviar um ou mais arquivos para um repositório (requer aprovação humana)",
      mode: "write",
      request: {
        method: "POST",
        path: "/repos/{owner}/{repo}/git/trees",
      },
      requiredArgs: ["owner", "repo", "files"],
      intentKeywords: [
        "push",
        "enviar arquivo",
        "commit",
        "atualizar arquivo",
        "criar arquivo no github",
        "push files",
      ],
    },
  ],
};
