/**
 * GitHub Code Search and Tree API (github.code.search, github.tree).
 * Code search queries within repo and extracts code snippets.
 * Repository tree fetches full or non-recursive tree items with sizes and types.
 */

import { getAccessToken } from "@/lib/connectors/service";

export type GithubCodeSearchOptions = {
  owner: string;
  repo: string;
  query: string;
  per_page?: number;
};

export type GithubTreeOptions = {
  owner: string;
  repo: string;
  tree_sha?: string;
  recursive?: boolean;
};

export type GithubCodeSearchResult =
  | {
      ok: true;
      output: string;
      items: Array<{
        path: string;
        htmlUrl: string;
        matches: Array<{ fragment: string }>;
      }>;
    }
  | { ok: false; error: string };

export type GithubTreeResult =
  | {
      ok: true;
      output: string;
      tree: Array<{
        path: string;
        type: "blob" | "tree";
        size?: number;
        sha: string;
      }>;
      truncated?: boolean;
    }
  | { ok: false; error: string };

async function ghJson(
  token: string,
  method: string,
  path: string,
  headers?: Record<string, string>
): Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number; error: string }> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Plutao-OS",
      ...headers,
    },
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

export async function githubCodeSearch(
  token: string,
  opts: GithubCodeSearchOptions
): Promise<GithubCodeSearchResult> {
  const owner = opts.owner.trim();
  const repo = opts.repo.trim();
  const query = opts.query.trim();
  const perPage = Math.min(30, Math.max(1, opts.per_page ?? 10));

  if (!owner || !repo || !query) {
    return { ok: false, error: "owner, repo e query são obrigatórios" };
  }

  const q = `${query} repo:${owner}/${repo}`;
  const res = await ghJson(
    token,
    "GET",
    `/search/code?q=${encodeURIComponent(q)}&per_page=${perPage}`,
    {
      Accept: "application/vnd.github.v3.text-match+json",
    }
  );

  if (!res.ok) {
    return { ok: false, error: `Falha na busca de código: ${res.error}` };
  }

  const data = res.data as { items?: unknown[] };
  const rawItems = Array.isArray(data.items) ? data.items : [];

  const items = rawItems.map((it) => {
    const obj = it as Record<string, unknown>;
    const path = String(obj.path ?? "");
    const htmlUrl = String(obj.html_url ?? "");
    const textMatches = Array.isArray(obj.text_matches) ? obj.text_matches : [];
    const matches = textMatches.map((m) => ({
      fragment: String((m as { fragment?: string }).fragment ?? ""),
    }));
    return { path, htmlUrl, matches };
  });

  const formattedBlocks = items.map((item, idx) => {
    const matchSnippets = item.matches
      .map((m) => m.fragment.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("\n---\n");
    return [
      `${idx + 1}. ${item.path}`,
      `   URL: ${item.htmlUrl}`,
      matchSnippets ? `   Trechos:\n${matchSnippets.split("\n").map((l) => `   | ${l}`).join("\n")}` : "   (sem prévia de trecho)",
    ].join("\n");
  });

  const output = [
    `Busca de código em ${owner}/${repo} para "${query}" (${items.length} resultados):`,
    formattedBlocks.join("\n\n") || "(nenhum resultado encontrado)",
  ].join("\n");

  return {
    ok: true,
    items,
    output,
  };
}

export async function githubTree(
  token: string,
  opts: GithubTreeOptions
): Promise<GithubTreeResult> {
  const owner = opts.owner.trim();
  const repo = opts.repo.trim();

  if (!owner || !repo) {
    return { ok: false, error: "owner e repo são obrigatórios" };
  }

  let treeSha = opts.tree_sha?.trim();

  // If no treeSha provided, find default branch
  if (!treeSha) {
    const repoRes = await ghJson(
      token,
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    );
    if (repoRes.ok) {
      treeSha = String((repoRes.data as { default_branch?: string }).default_branch || "main");
    } else {
      treeSha = "main";
    }
  }

  const recursiveFlag = opts.recursive !== false ? "1" : "0";
  const treeRes = await ghJson(
    token,
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=${recursiveFlag}`
  );

  if (!treeRes.ok) {
    return { ok: false, error: `Falha ao obter árvore do repositório: ${treeRes.error}` };
  }

  const data = treeRes.data as { tree?: unknown[]; truncated?: boolean };
  const rawTree = Array.isArray(data.tree) ? data.tree : [];
  const truncated = Boolean(data.truncated);

  const tree = rawTree.map((it) => {
    const obj = it as Record<string, unknown>;
    const type = obj.type === "tree" ? ("tree" as const) : ("blob" as const);
    return {
      path: String(obj.path ?? ""),
      type,
      size: typeof obj.size === "number" ? obj.size : undefined,
      sha: String(obj.sha ?? ""),
    };
  });

  const lines = tree.slice(0, 100).map((item) => {
    const icon = item.type === "tree" ? "📁" : "📄";
    const sizeStr = item.size !== undefined ? ` (${item.size} bytes)` : "";
    return `${icon} ${item.path}${sizeStr}`;
  });

  const output = [
    `Árvore de arquivos de ${owner}/${repo}@${treeSha} (${tree.length} itens${truncated ? ", truncada pela API" : ""}):`,
    lines.join("\n") || "(árvore vazia)",
    tree.length > 100 ? `... e mais ${tree.length - 100} itens.` : "",
  ].filter(Boolean).join("\n");

  return {
    ok: true,
    tree,
    truncated,
    output,
  };
}

export async function githubCodeSearchWithUserId(
  userId: string,
  opts: GithubCodeSearchOptions
): Promise<GithubCodeSearchResult> {
  const token = await getAccessToken(userId, "github");
  if (!token) return { ok: false, error: "GitHub não conectado ou token indisponível" };
  return githubCodeSearch(token, opts);
}

export async function githubTreeWithUserId(
  userId: string,
  opts: GithubTreeOptions
): Promise<GithubTreeResult> {
  const token = await getAccessToken(userId, "github");
  if (!token) return { ok: false, error: "GitHub não conectado ou token indisponível" };
  return githubTree(token, opts);
}
