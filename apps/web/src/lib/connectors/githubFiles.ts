/**
 * GitHub files write client (github.files.write capability).
 * Enforces security limits (max 20 files, max 100KB per file, no path traversal '..').
 * Uses GitHub Git Trees API for atomic multi-file updates in a single commit.
 */

import { getAccessToken } from "@/lib/connectors/service";

export type GhWriteFile = { path: string; content: string };

export type GithubWriteFilesOptions = {
  owner: string;
  repo: string;
  files: GhWriteFile[];
  message?: string;
  branch?: string;
};

export type GithubWriteFilesResult =
  | { ok: true; output: string; commitSha: string; htmlUrl?: string }
  | { ok: false; error: string };

async function ghJson(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
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
    return { ok: false, error: msg };
  }
  return { ok: true, data };
}

export async function githubWriteFiles(
  userId: string,
  opts: GithubWriteFilesOptions
): Promise<GithubWriteFilesResult> {
  const token = await getAccessToken(userId, "github");
  if (!token) {
    return { ok: false, error: "GitHub não conectado ou token indisponível" };
  }
  return githubWriteFilesWithToken(token, opts);
}

export async function githubWriteFilesWithToken(
  token: string,
  opts: GithubWriteFilesOptions
): Promise<GithubWriteFilesResult> {
  const owner = opts.owner.trim();
  const repo = opts.repo.trim();
  const branch = (opts.branch || "main").trim();
  const files = opts.files || [];

  if (!owner || !repo) {
    return { ok: false, error: "owner e repo obrigatórios" };
  }
  if (files.length === 0) {
    return { ok: false, error: "files[] vazio" };
  }
  if (files.length > 20) {
    return { ok: false, error: "máximo 20 arquivos por operação" };
  }

  for (const f of files) {
    if (!f.path || typeof f.content !== "string") {
      return { ok: false, error: "arquivo inválido (path e content obrigatórios)" };
    }
    if (f.path.includes("..")) {
      return { ok: false, error: `path traversal detectado: ${f.path}` };
    }
    const byteSize = Buffer.byteLength(f.content, "utf-8");
    if (byteSize > 100 * 1024) {
      return { ok: false, error: `arquivo excede o limite de 100KB: ${f.path}` };
    }
  }

  // 1. Resolve branch ref
  let activeBranch = branch;
  let refData: unknown;

  const refRes = await ghJson(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`
  );

  if (refRes.ok) {
    refData = refRes.data;
  } else {
    const alt = await ghJson(token, "GET", `/repos/${owner}/${repo}/git/ref/heads/master`);
    if (!alt.ok) {
      return { ok: false, error: `branch ${branch} não encontrada: ${refRes.error}` };
    }
    activeBranch = "master";
    refData = alt.data;
  }

  const refObj = refData as { object?: { sha?: string } };
  const baseCommitSha = refObj.object?.sha;
  if (!baseCommitSha) return { ok: false, error: "SHA da branch ausente" };

  // 2. Fetch base commit
  const commitRes = await ghJson(token, "GET", `/repos/${owner}/${repo}/git/commits/${baseCommitSha}`);
  if (!commitRes.ok) return commitRes;
  const baseTreeSha = (commitRes.data as { tree?: { sha?: string } }).tree?.sha;
  if (!baseTreeSha) return { ok: false, error: "tree SHA ausente" };

  // 3. Create blobs for each file
  const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  for (const f of files) {
    const blob = await ghJson(token, "POST", `/repos/${owner}/${repo}/git/blobs`, {
      content: f.content,
      encoding: "utf-8",
    });
    if (!blob.ok) return { ok: false, error: `blob ${f.path}: ${blob.error}` };
    const sha = (blob.data as { sha?: string }).sha;
    if (!sha) return { ok: false, error: `blob sem sha: ${f.path}` };
    treeItems.push({ path: f.path.replace(/^\//, ""), mode: "100644", type: "blob", sha });
  }

  // 4. Create new tree
  const treeRes = await ghJson(token, "POST", `/repos/${owner}/${repo}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeItems,
  });
  if (!treeRes.ok) return treeRes;
  const newTreeSha = (treeRes.data as { sha?: string }).sha;
  if (!newTreeSha) return { ok: false, error: "nova tree sem sha" };

  // 5. Create new commit
  const msg = (opts.message || `Plutão: atualiza ${files.length} arquivo(s)`).slice(0, 500);
  const newCommit = await ghJson(token, "POST", `/repos/${owner}/${repo}/git/commits`, {
    message: msg,
    tree: newTreeSha,
    parents: [baseCommitSha],
  });
  if (!newCommit.ok) return newCommit;
  const newCommitSha = (newCommit.data as { sha?: string; html_url?: string }).sha;
  if (!newCommitSha) return { ok: false, error: "commit sem sha" };

  // 6. Update branch reference
  const updateRef = await ghJson(
    token,
    "PATCH",
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(activeBranch)}`,
    {
      sha: newCommitSha,
      force: false,
    }
  );
  if (!updateRef.ok) return updateRef;

  // 7. Post-write read-back verification
  for (const f of files) {
    const cleanPath = f.path.replace(/^\//, "");
    const readRes = await ghJson(
      token,
      "GET",
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(cleanPath)}?ref=${encodeURIComponent(activeBranch)}`
    );

    if (!readRes.ok) {
      return {
        ok: false,
        error: `Falha na verificação pós-escrita: não foi possível ler o arquivo '${f.path}' do GitHub (${readRes.error}).`,
      };
    }

    const rawBase64 = String((readRes.data as { content?: string })?.content ?? "").replace(/\s+/g, "");
    const readContent = Buffer.from(rawBase64, "base64").toString("utf-8");

    if (readContent !== f.content) {
      return {
        ok: false,
        error: `Divergência detectada após escrita no arquivo '${f.path}': o conteúdo lido do GitHub não corresponde ao conteúdo enviado.`,
      };
    }
  }

  const paths = files.map((f) => f.path).join(", ");
  return {
    ok: true,
    commitSha: newCommitSha,
    htmlUrl: (newCommit.data as { html_url?: string }).html_url,
    output: [
      `push ok: ${owner}/${repo}@${activeBranch}`,
      `commit: ${newCommitSha}`,
      `arquivos (${files.length}): ${paths}`,
      `verificação pós-escrita: 100% verificado sem divergências`,
      `message: ${msg}`,
    ].join("\n"),
  };
}
