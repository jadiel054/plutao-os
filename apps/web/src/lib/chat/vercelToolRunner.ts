export type VercelToolExecutionResult = {
  executed: boolean;
  capability?: string;
  output?: string;
  error?: string;
  trace?: { input: string };
};

function wantsListProjects(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes("projeto") || t.includes("project")) &&
    (t.includes("vercel") || t.includes("liste") || t.includes("listar") || t.includes("meus"))
  );
}

function wantsListDeployments(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes("deploy") || t.includes("deployment")) &&
    (t.includes("vercel") || t.includes("liste") || t.includes("listar") || t.includes("último") || t.includes("ultimo"))
  );
}

async function vercelGet(
  path: string,
  token: string
): Promise<{ ok: boolean; data: unknown; status: number }> {
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function detectAndExecuteVercelTool(opts: {
  userText: string;
  accessToken: string;
  accountLogin?: string | null;
}): Promise<VercelToolExecutionResult> {
  const { userText, accessToken } = opts;

  if (wantsListProjects(userText)) {
    const { ok, data, status } = await vercelGet("/v9/projects?limit=20", accessToken);
    if (!ok) {
      return {
        executed: true,
        capability: "projects_list",
        error: `Vercel API ${status}: ${JSON.stringify(data).slice(0, 200)}`,
        trace: { input: "GET /v9/projects" },
      };
    }
    const projects = Array.isArray((data as { projects?: unknown[] }).projects)
      ? (data as { projects: Array<Record<string, unknown>> }).projects
      : [];
    const lines = projects.map((p, i) => {
      const name = String(p.name || p.id || "project");
      const framework = p.framework ? String(p.framework) : "—";
      return `${i + 1}. **${name}** — framework: ${framework}`;
    });
    return {
      executed: true,
      capability: "projects_list",
      output:
        lines.length > 0
          ? `Projetos Vercel (${lines.length}):\n\n${lines.join("\n")}`
          : "Nenhum projeto encontrado nesta conta/token.",
      trace: { input: "GET /v9/projects?limit=20" },
    };
  }

  if (wantsListDeployments(userText)) {
    const { ok, data, status } = await vercelGet("/v6/deployments?limit=15", accessToken);
    if (!ok) {
      return {
        executed: true,
        capability: "deployments_list",
        error: `Vercel API ${status}: ${JSON.stringify(data).slice(0, 200)}`,
        trace: { input: "GET /v6/deployments" },
      };
    }
    const deployments = Array.isArray((data as { deployments?: unknown[] }).deployments)
      ? (data as { deployments: Array<Record<string, unknown>> }).deployments
      : [];
    const lines = deployments.map((d, i) => {
      const name = String(d.name || d.url || d.uid || "deploy");
      const state = String(d.readyState || d.state || "—");
      const url = d.url ? `https://${d.url}` : "";
      return `${i + 1}. **${name}** — ${state}${url ? ` · ${url}` : ""}`;
    });
    return {
      executed: true,
      capability: "deployments_list",
      output:
        lines.length > 0
          ? `Deployments recentes (${lines.length}):\n\n${lines.join("\n")}`
          : "Nenhum deployment encontrado.",
      trace: { input: "GET /v6/deployments?limit=15" },
    };
  }

  return { executed: false };
}
