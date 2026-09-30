/**
 * Vercel write operations (project create + deploy from GitHub).
 * Only called after write_gate approval (Princípio 1).
 */

type VercelJsonResult =
  | { ok: true; data: unknown; status: number }
  | { ok: false; error: string; status: number };

async function vercelJson(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<VercelJsonResult> {
  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "error" in data
        ? String(
            (data as { error?: { message?: string } | string }).error &&
              typeof (data as { error: unknown }).error === "object"
              ? ((data as { error: { message?: string } }).error.message ?? `HTTP ${res.status}`)
              : (data as { error?: string }).error ?? `HTTP ${res.status}`
          )
        : typeof data === "object" && data && "message" in data
          ? String((data as { message: unknown }).message)
          : `HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }
  return { ok: true, data, status: res.status };
}

function sanitizeProjectName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/**
 * Create a Vercel project, optionally linked to a GitHub repo (owner/repo).
 */
export async function vercelCreateProject(
  token: string,
  opts: {
    name: string;
    framework?: string | null;
    gitRepo?: string | null;
    teamId?: string | null;
  }
): Promise<
  | {
      ok: true;
      output: string;
      projectId: string;
      projectName: string;
      url?: string;
    }
  | { ok: false; error: string }
> {
  const name = sanitizeProjectName(opts.name || "");
  if (!name) return { ok: false, error: "nome de projeto inválido" };

  const body: Record<string, unknown> = {
    name,
    framework: opts.framework || undefined,
  };

  if (opts.gitRepo && opts.gitRepo.includes("/")) {
    const [repoOwner, repoName] = opts.gitRepo.split("/", 2);
    if (repoOwner && repoName) {
      body.gitRepository = {
        type: "github",
        repo: `${repoOwner}/${repoName}`,
      };
    }
  }

  const qs = opts.teamId ? `?teamId=${encodeURIComponent(opts.teamId)}` : "";
  const res = await vercelJson(token, "POST", `/v10/projects${qs}`, body);
  if (!res.ok) return { ok: false, error: res.error };

  const o = res.data as Record<string, unknown>;
  const projectId = String(o.id ?? "");
  const projectName = String(o.name ?? name);
  const link = o.link as Record<string, unknown> | undefined;
  const url =
    typeof o.alias === "object" && Array.isArray(o.alias) && o.alias[0]
      ? `https://${String((o.alias as unknown[])[0])}`
      : undefined;

  return {
    ok: true,
    projectId,
    projectName,
    url,
    output: [
      `projeto criado: ${projectName}`,
      `id: ${projectId}`,
      opts.gitRepo ? `git: github/${opts.gitRepo}` : "git: (não vinculado)",
      link?.type ? `link.type: ${String(link.type)}` : null,
      url ? `url: ${url}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Create a deployment for a project from GitHub source.
 */
export async function vercelCreateDeployment(
  token: string,
  opts: {
    projectName: string;
    projectId?: string | null;
    gitRepo?: string | null;
    branch?: string | null;
    target?: "production" | "preview" | null;
    teamId?: string | null;
  }
): Promise<
  | {
      ok: true;
      output: string;
      deploymentId: string;
      url?: string;
      inspectorUrl?: string;
      readyState?: string;
    }
  | { ok: false; error: string }
> {
  const name = sanitizeProjectName(opts.projectName || "");
  if (!name) return { ok: false, error: "projectName obrigatório" };

  const body: Record<string, unknown> = {
    name,
    project: opts.projectId || name,
    target: opts.target === "preview" ? "preview" : "production",
  };

  if (opts.gitRepo && opts.gitRepo.includes("/")) {
    const [repoOwner, repoName] = opts.gitRepo.split("/", 2);
    if (repoOwner && repoName) {
      body.gitSource = {
        type: "github",
        repo: `${repoOwner}/${repoName}`,
        ref: (opts.branch || "main").trim() || "main",
      };
    }
  }

  const qs = opts.teamId ? `?teamId=${encodeURIComponent(opts.teamId)}` : "";
  const res = await vercelJson(token, "POST", `/v13/deployments${qs}`, body);
  if (!res.ok) return { ok: false, error: res.error };

  const o = res.data as Record<string, unknown>;
  const deploymentId = String(o.id ?? o.uid ?? "");
  const url = o.url ? `https://${String(o.url)}` : undefined;
  const inspectorUrl = o.inspectorUrl ? String(o.inspectorUrl) : undefined;
  const readyState = o.readyState ? String(o.readyState) : undefined;

  return {
    ok: true,
    deploymentId,
    url,
    inspectorUrl,
    readyState,
    output: [
      `deployment criado: ${deploymentId}`,
      `projeto: ${name}`,
      readyState ? `state: ${readyState}` : null,
      url ? `url: ${url}` : null,
      inspectorUrl ? `inspector: ${inspectorUrl}` : null,
      opts.gitRepo ? `git: ${opts.gitRepo}@${opts.branch || "main"}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
