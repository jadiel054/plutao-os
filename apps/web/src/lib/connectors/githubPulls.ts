/**
 * GitHub Pull Requests management (github.prs.create, github.prs.list, github.prs.get).
 * Validates head and base branch existence prior to opening PRs.
 * Merging is intentionally NOT supported (decisão humana no GitHub).
 */

import { getAccessToken } from "@/lib/connectors/service";

export type GithubPullsCreateOptions = {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  head: string;
  base: string;
};

export type GithubPullsListOptions = {
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  per_page?: number;
};

export type GithubPullsGetOptions = {
  owner: string;
  repo: string;
  number: number;
};

export type GithubPullsCreateResult =
  | { ok: true; output: string; number: number; htmlUrl: string }
  | { ok: false; error: string };

export type GithubPullsListResult =
  | {
      ok: true;
      output: string;
      pulls: Array<{
        number: number;
        title: string;
        state: string;
        head: string;
        base: string;
        htmlUrl: string;
      }>;
    }
  | { ok: false; error: string };

export type GithubPullsGetResult =
  | {
      ok: true;
      output: string;
      pr: {
        number: number;
        title: string;
        body: string;
        state: string;
        head: string;
        base: string;
        htmlUrl: string;
        additions: number;
        deletions: number;
        mergeable: boolean | null;
        reviewers: string[];
      };
    }
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

export async function githubPullsCreate(
  token: string,
  opts: GithubPullsCreateOptions
): Promise<GithubPullsCreateResult> {
  const owner = opts.owner.trim();
  const repo = opts.repo.trim();
  const title = opts.title.trim();
  const body = opts.body?.trim() ?? "";
  const head = opts.head.trim();
  const base = opts.base.trim();

  if (!owner || !repo || !title || !head || !base) {
    return { ok: false, error: "owner, repo, title, head e base são obrigatórios" };
  }

  // 1. Verify head branch exists
  const headRef = await ghJson(
    token,
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(head)}`
  );
  if (!headRef.ok) {
    return {
      ok: false,
      error: `Branch de origem (head) '${head}' não encontrada no repositório.`,
    };
  }

  // 2. Verify base branch exists
  const baseRef = await ghJson(
    token,
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(base)}`
  );
  if (!baseRef.ok) {
    return {
      ok: false,
      error: `Branch de destino (base) '${base}' não encontrada no repositório.`,
    };
  }

  // 3. Create Pull Request
  const prRes = await ghJson(
    token,
    "POST",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    {
      title,
      body,
      head,
      base,
    }
  );

  if (!prRes.ok) {
    return { ok: false, error: `Falha ao criar pull request: ${prRes.error}` };
  }

  const data = prRes.data as { number?: number; html_url?: string };
  const num = data.number ?? 0;
  const htmlUrl = data.html_url ?? "";

  return {
    ok: true,
    number: num,
    htmlUrl,
    output: [
      `Pull Request #${num} aberto com sucesso em ${owner}/${repo}`,
      `Título: ${title}`,
      `De: ${head} → Para: ${base}`,
      `URL: ${htmlUrl}`,
    ].join("\n"),
  };
}

export async function githubPullsList(
  token: string,
  opts: GithubPullsListOptions
): Promise<GithubPullsListResult> {
  const owner = opts.owner.trim();
  const repo = opts.repo.trim();
  const state = opts.state || "open";
  const perPage = Math.min(100, Math.max(1, opts.per_page ?? 30));

  if (!owner || !repo) {
    return { ok: false, error: "owner e repo são obrigatórios" };
  }

  const res = await ghJson(
    token,
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}&per_page=${perPage}`
  );

  if (!res.ok) {
    return { ok: false, error: `Falha ao listar pull requests: ${res.error}` };
  }

  const list = Array.isArray(res.data) ? res.data : [];
  const pulls = list.map((p: Record<string, unknown>) => ({
    number: Number(p.number ?? 0),
    title: String(p.title ?? ""),
    state: String(p.state ?? ""),
    head: String((p.head as { ref?: string })?.ref ?? ""),
    base: String((p.base as { ref?: string })?.ref ?? ""),
    htmlUrl: String(p.html_url ?? ""),
  }));

  const lines = pulls.map(
    (p) => `- #${p.number} [${p.state}] ${p.title} (${p.head} → ${p.base}) · ${p.htmlUrl}`
  );

  return {
    ok: true,
    pulls,
    output: `pull requests em ${owner}/${repo} [${state}] (${pulls.length}):\n${lines.join("\n") || "(nenhum PR encontrado)"}`,
  };
}

export async function githubPullsGet(
  token: string,
  opts: GithubPullsGetOptions
): Promise<GithubPullsGetResult> {
  const owner = opts.owner.trim();
  const repo = opts.repo.trim();
  const number = opts.number;

  if (!owner || !repo || !number) {
    return { ok: false, error: "owner, repo e number são obrigatórios" };
  }

  const res = await ghJson(
    token,
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`
  );

  if (!res.ok) {
    return { ok: false, error: `Falha ao obter pull request #${number}: ${res.error}` };
  }

  const o = res.data as Record<string, unknown>;
  const requestedReviewers = Array.isArray(o.requested_reviewers) ? o.requested_reviewers : [];
  const reviewers = requestedReviewers
    .map((r) => String((r as { login?: string }).login ?? ""))
    .filter(Boolean);

  const pr = {
    number: Number(o.number ?? number),
    title: String(o.title ?? ""),
    body: String(o.body ?? ""),
    state: String(o.state ?? ""),
    head: String((o.head as { ref?: string })?.ref ?? ""),
    base: String((o.base as { ref?: string })?.ref ?? ""),
    htmlUrl: String(o.html_url ?? ""),
    additions: Number(o.additions ?? 0),
    deletions: Number(o.deletions ?? 0),
    mergeable: typeof o.mergeable === "boolean" ? o.mergeable : null,
    reviewers,
  };

  const output = [
    `PR #${pr.number} [${pr.state}] ${pr.title}`,
    `De: ${pr.head} → Para: ${pr.base}`,
    `Adições: +${pr.additions} | Remoções: -${pr.deletions}`,
    `Mergeável: ${pr.mergeable === true ? "Sim" : pr.mergeable === false ? "Não (conflitos)" : "Pendente"}`,
    `Revisores: ${pr.reviewers.length > 0 ? pr.reviewers.join(", ") : "nenhum"}`,
    `URL: ${pr.htmlUrl}`,
    `\nDescrição:\n${pr.body || "(sem descrição)"}`,
  ].join("\n");

  return {
    ok: true,
    pr,
    output,
  };
}

export function githubPullsMergeNotice(): string {
  return "Operações de merge não são executadas automaticamente pelo agente por segurança. O merge de Pull Requests deve ser realizado manualmente por um humano no GitHub.";
}

export async function githubPullsCreateWithUserId(
  userId: string,
  opts: GithubPullsCreateOptions
): Promise<GithubPullsCreateResult> {
  const token = await getAccessToken(userId, "github");
  if (!token) return { ok: false, error: "GitHub não conectado ou token indisponível" };
  return githubPullsCreate(token, opts);
}

export async function githubPullsListWithUserId(
  userId: string,
  opts: GithubPullsListOptions
): Promise<GithubPullsListResult> {
  const token = await getAccessToken(userId, "github");
  if (!token) return { ok: false, error: "GitHub não conectado ou token indisponível" };
  return githubPullsList(token, opts);
}

export async function githubPullsGetWithUserId(
  userId: string,
  opts: GithubPullsGetOptions
): Promise<GithubPullsGetResult> {
  const token = await getAccessToken(userId, "github");
  if (!token) return { ok: false, error: "GitHub não conectado ou token indisponível" };
  return githubPullsGet(token, opts);
}
