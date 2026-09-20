/**
 * Runner Vercel — detecta intenção e chama API oficial com token do conector.
 * Contrato alinhado ao githubToolRunner (contextText para o modelo).
 */

export type VercelToolCallTrace = {
  id: string;
  provider: "vercel";
  capability: string;
  input: Record<string, unknown> | string;
  output: string;
  status: "ok" | "error";
  durationMs: number;
  timestamp: string;
};

export type VercelToolExecutionResult = {
  executed: boolean;
  missingArgs?: boolean;
  capability?: string;
  trace?: VercelToolCallTrace;
  contextText?: string;
  suggestedFollowUps?: Array<{ id: string; label: string; prompt: string }>;
  /** @deprecated use contextText */
  output?: string;
  error?: string;
};

export const VERCEL_REQUIRED_ARGS: Record<string, string[]> = {
  projects_list: [],
  deployments_list: ["projectId"],
};

function wantsListProjects(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("vercel") && !t.includes("projeto") && !t.includes("project")) return false;
  return (
    t.includes("projeto") ||
    t.includes("project") ||
    t.includes("listar") ||
    t.includes("liste") ||
    t.includes("lista") ||
    t.includes("mostrar") ||
    t.includes("quais") ||
    t.includes("consulta") ||
    t.includes("consultar") ||
    t.includes("pode fazer") ||
    (t.includes("vercel") && (t.includes("conectado") || t.includes("meus")))
  );
}

function wantsListDeployments(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes("deploy") || t.includes("deployment") || t.includes("publica")) &&
    (t.includes("vercel") || t.includes("listar") || t.includes("liste") || t.includes("último") || t.includes("ultimo"))
  );
}

function wantsSpecificProjectDeployment(text: string): boolean {
  const t = text.toLowerCase();
  return (
    wantsListDeployments(text) &&
    (t.includes("projeto") || t.includes("project") || t.includes("do meu app") || t.includes("do app"))
  );
}

function extractProjectNamesFromData(data: unknown): string[] {
  const projects = Array.isArray((data as { projects?: unknown[] }).projects)
    ? (data as { projects: Array<Record<string, unknown>> }).projects
    : [];
  return projects
    .map((p) => String(p.name || p.id || "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

async function vercelGet(
  path: string,
  token: string
): Promise<{ ok: boolean; data: unknown; status: number; durationMs: number }> {
  const t0 = Date.now();
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status, durationMs: Date.now() - t0 };
}

function formatProjects(data: unknown): string {
  const projects = Array.isArray((data as { projects?: unknown[] }).projects)
    ? (data as { projects: Array<Record<string, unknown>> }).projects
    : [];
  if (projects.length === 0) return "Nenhum projeto encontrado nesta conta Vercel.";
  const lines = projects.map((p, i) => {
    const name = String(p.name || p.id || "project");
    const id = String(p.id || "");
    const framework = p.framework ? String(p.framework) : "—";
    return `${i + 1}. **${name}**\n   id: \`${id}\` · framework: ${framework}`;
  });
  return `Projetos Vercel (${projects.length}):\n\n${lines.join("\n\n")}`;
}

function formatDeployments(data: unknown): string {
  const deployments = Array.isArray((data as { deployments?: unknown[] }).deployments)
    ? (data as { deployments: Array<Record<string, unknown>> }).deployments
    : [];
  if (deployments.length === 0) return "Nenhum deployment encontrado.";
  const lines = deployments.map((d, i) => {
    const name = String(d.name || d.url || d.uid || "deploy");
    const state = String(d.readyState || d.state || "—");
    const url = d.url ? `https://${d.url}` : "";
    return `${i + 1}. **${name}** — ${state}${url ? `\n   ${url}` : ""}`;
  });
  return `Deployments recentes (${deployments.length}):\n\n${lines.join("\n\n")}`;
}

export async function detectAndExecuteVercelTool(opts: {
  text?: string;
  userText?: string;
  userId?: string;
  accessToken: string;
  accountLogin?: string | null;
}): Promise<VercelToolExecutionResult> {
  const userText = opts.text ?? opts.userText ?? "";
  const accessToken = opts.accessToken;
  const timestamp = new Date().toISOString();

  const run = async (
    capability: string,
    path: string,
    formatter: (data: unknown) => string
  ): Promise<VercelToolExecutionResult> => {
    const res = await vercelGet(path, accessToken);
    const output = res.ok
      ? formatter(res.data)
      : `Vercel API ${res.status}: ${JSON.stringify(res.data).slice(0, 240)}`;
    const trace: VercelToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "vercel",
      capability,
      input: { method: "GET", path },
      output,
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR VERCEL]\nCapability: ${capability}\nStatus: Sucesso (${res.durationMs}ms)\nDados:\n${output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR VERCEL]\nCapability: ${capability}\nStatus: Erro\n${output}`;
    return {
      executed: true,
      capability,
      trace,
      contextText,
      output: res.ok ? output : undefined,
      error: res.ok ? undefined : output,
    };
  };

  if (wantsSpecificProjectDeployment(userText)) {
    // Check if project name is specified in user text
    const projRes = await vercelGet("/v9/projects?limit=10", accessToken);
    const recentProjects = projRes.ok ? extractProjectNamesFromData(projRes.data) : [];
    const matchedProject = recentProjects.find((p) => userText.toLowerCase().includes(p.toLowerCase()));

    if (!matchedProject) {
      const followUps = recentProjects.map((p, i) => ({
        id: `fu-vercel-missing-proj-${i + 1}`,
        label: p,
        prompt: `mostre os deployments do projeto ${p} na Vercel`,
      }));

      const contextText = `[ESCLARECIMENTO DE PARÂMETROS - VERCEL]
O usuário quer ver os deployments de um projeto na Vercel, mas não especificou qual projeto.
Projetos recentes do usuário: ${recentProjects.length > 0 ? recentProjects.join(", ") : "nenhum encontrado"}.
Pergunte ao usuário qual projeto ele deseja consultar, oferecendo essas opções de forma objetiva e direta. Não tente adivinhar.`;

      return {
        executed: false,
        missingArgs: true,
        capability: "deployments_list",
        contextText,
        suggestedFollowUps: followUps,
      };
    }

    return run("deployments_list", `/v6/deployments?projectId=${encodeURIComponent(matchedProject)}&limit=15`, formatDeployments);
  }

  if (wantsListDeployments(userText)) {
    return run("deployments_list", "/v6/deployments?limit=15", formatDeployments);
  }

  if (wantsListProjects(userText)) {
    return run("projects_list", "/v9/projects?limit=20", formatProjects);
  }

  // Pedido genérico com Vercel conectado + "consulta" / "pode fazer"
  const t = userText.toLowerCase();
  if (t.includes("vercel") && (t.includes("consulta") || t.includes("pode") || t.includes("list"))) {
    return run("projects_list", "/v9/projects?limit=20", formatProjects);
  }

  return { executed: false };
}
