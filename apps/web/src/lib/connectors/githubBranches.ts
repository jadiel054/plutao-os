/**
 * GitHub Branches management (github.branches.list, github.branches.create).
 * Validates branch names (allowed: a-zA-Z0-9._-/, no '..') and checks branch existence.
 */

import { getAccessToken } from "@/lib/connectors/service";

export type GithubBranchesListOptions = {
  owner: string;
  repo: string;
  per_page?: number;
};

export type GithubBranchesCreateOptions = {
  owner: string;
  repo: string;
  branch: string;
  from_branch?: string;
};

export type GithubBranchesListResult =
  | { ok: true; output: string; branches: Array<{ name: string; protected?: boolean; commitSha?: string }> }
  | { ok: false; error: string };

export type GithubBranchesCreateResult =
  | { ok: true; output: string; branch: string; ref: string; sha: string }
  | { ok: false; error: string };

async function ghJson(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number; error: string }> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Plutao-OS",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "message" in data
        ? String((data as { message: unknown }).message)
        : `HTTP ${res.status}`;
    return { ok: false, status: res.status, error: msg };
  }
  return { ok: true, status: res.status, data };
}

export function isValidBranchName(branch: string): boolean {
  if (!branch || branch.trim().length === 0) return false;
  if (branch.includes("..")) return false;
  return /^[a-zA-Z0-9._\-/]+$/.test(branch);
}

export async function githubBranchesList(
  token: string,
  opts: GithubBranchesListOptions
): Promise<GithubBranchesListResult> {
  const owner = opts.owner.trim();
  const repo = opts.repo.trim();
  const perPage = Math.min(100, Math.max(1, opts.per_page ?? 30));

  if (!owner || !repo) {
    return { ok: false, error: "owner e repo são obrigatórios" };
  }

  const res = await ghJson(
    token,
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=${perPage}`
  );

  if (!res.ok) {
    return { ok: false, error: `Falha ao listar branches: ${res.error}` };
  }

  const list = Array.isArray(res.data) ? res.data : [];
  const branches = list.map((b: Record<string, unknown>) => ({
    name: String(b.name ?? ""),
    protected: Boolean(b.protected),
    commitSha: (b.commit as { sha?: string })?.sha,
  }));

  const lines = branches.map(
    (b) => `- ${b.name}${b.protected ? " [protegida]" : ""}${b.commitSha ? ` (${b.commitSha.slice(0, 7)})` : ""}`
  );

  return {
    ok: true,
    branches,
    output: `branches em ${owner}/${repo} (${branches.length}):\n${lines.join("\n") || "(nenhuma branch encontrada)"}`,
  };
}

export async function githubBranchesCreate(
  token: string,
  opts: GithubBranchesCreateOptions
): Promise<GithubBranchesCreateResult> {
  const owner = opts.owner.trim();
  const repo = opts.repo.trim();
  const branch = opts.branch.trim();
  const fromBranch = opts.from_branch?.trim();

  if (!owner || !repo) {
    return { ok: false, error: "owner e repo são obrigatórios" };
  }

  if (!isValidBranchName(branch)) {
    return {
      ok: false,
      error:
        "Nome de branch inválido. Use apenas letras, números, ponto, hífen, underline ou barra, e não use '..'.",
    };
  }

  // Check if branch already exists
  const checkRes = await ghJson(
    token,
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`
  );

  if (checkRes.ok) {
    return { ok: false, error: `A branch '${branch}' já existe no repositório.` };
  }

  // Resolve base commit SHA from fromBranch or repo default branch
  let baseSha: string | undefined;
  let sourceBranch = fromBranch;

  if (sourceBranch) {
    const refRes = await ghJson(
      token,
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(sourceBranch)}`
    );
    if (!refRes.ok) {
      return { ok: false, error: `Branch de origem '${sourceBranch}' não encontrada: ${refRes.error}` };
    }
    baseSha = (refRes.data as { object?: { sha?: string } })?.object?.sha;
  } else {
    // Get default branch of the repository
    const repoRes = await ghJson(
      token,
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    );
    if (!repoRes.ok) {
      return { ok: false, error: `Falha ao obter metadados do repositório: ${repoRes.error}` };
    }
    const defaultBranch = String((repoRes.data as { default_branch?: string })?.default_branch || "main");
    sourceBranch = defaultBranch;

    const refRes = await ghJson(
      token,
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(defaultBranch)}`
    );
    if (refRes.ok) {
      baseSha = (refRes.data as { object?: { sha?: string } })?.object?.sha;
    } else {
      // Fallback to master if main ref lookup failed
      const altRef = await ghJson(
        token,
        "GET",
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/master`
      );
      if (altRef.ok) {
        sourceBranch = "master";
        baseSha = (altRef.data as { object?: { sha?: string } })?.object?.sha;
      }
    }
  }

  if (!baseSha) {
    return { ok: false, error: `Não foi possível determinar o SHA de origem para criar a branch '${branch}'.` };
  }

  // Create branch reference
  const createRes = await ghJson(
    token,
    "POST",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
    {
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    }
  );

  if (!createRes.ok) {
    return { ok: false, error: `Falha ao criar branch '${branch}': ${createRes.error}` };
  }

  return {
    ok: true,
    branch,
    ref: `refs/heads/${branch}`,
    sha: baseSha,
    output: `Branch '${branch}' criada com sucesso no repositório ${owner}/${repo} a partir de '${sourceBranch}' (${baseSha.slice(0, 7)}).`,
  };
}

export async function githubBranchesListWithUserId(
  userId: string,
  opts: GithubBranchesListOptions
): Promise<GithubBranchesListResult> {
  const token = await getAccessToken(userId, "github");
  if (!token) return { ok: false, error: "GitHub não conectado ou token indisponível" };
  return githubBranchesList(token, opts);
}

export async function githubBranchesCreateWithUserId(
  userId: string,
  opts: GithubBranchesCreateOptions
): Promise<GithubBranchesCreateResult> {
  const token = await getAccessToken(userId, "github");
  if (!token) return { ok: false, error: "GitHub não conectado ou token indisponível" };
  return githubBranchesCreate(token, opts);
}
