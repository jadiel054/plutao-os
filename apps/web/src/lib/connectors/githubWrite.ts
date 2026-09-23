/**
 * GitHub write operations (repo create + multi-file push).
 * Only called after write_gate approval (Princípio 1).
 */

type GhFile = { path: string; content: string };

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
    /* keep text */
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

export async function githubCreateRepo(
  token: string,
  opts: { name: string; private?: boolean; description?: string }
): Promise<{ ok: true; output: string; fullName: string; htmlUrl: string } | { ok: false; error: string }> {
  const name = opts.name.trim().replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100);
  if (!name) return { ok: false, error: "nome de repositório inválido" };

  const res = await ghJson(token, "POST", "/user/repos", {
    name,
    private: Boolean(opts.private),
    description: opts.description?.slice(0, 350) || "Criado pelo Plutão",
    auto_init: true,
  });
  if (!res.ok) return res;

  const o = res.data as Record<string, unknown>;
  const fullName = String(o.full_name ?? name);
  const htmlUrl = String(o.html_url ?? "");
  return {
    ok: true,
    fullName,
    htmlUrl,
    output: [
      `repo criado: ${fullName}`,
      `private: ${Boolean(opts.private)}`,
      `html_url: ${htmlUrl}`,
      `default_branch: ${o.default_branch ?? "main"}`,
    ].join("\n"),
  };
}

export async function githubPushFiles(
  token: string,
  opts: {
    owner: string;
    repo: string;
    files: GhFile[];
    message?: string;
    branch?: string;
  }
): Promise<{ ok: true; output: string; commitSha: string; htmlUrl?: string } | { ok: false; error: string }> {
  const owner = opts.owner.trim();
  const repo = opts.repo.trim();
  const branch = (opts.branch || "main").trim();
  const files = (opts.files || []).filter((f) => f.path && typeof f.content === "string");
  if (!owner || !repo) return { ok: false, error: "owner e repo obrigatórios" };
  if (files.length === 0) return { ok: false, error: "files[] vazio" };
  if (files.length > 40) return { ok: false, error: "máximo 40 arquivos por push" };

  const refRes = await ghJson(token, "GET", `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!refRes.ok) {
    const alt = await ghJson(token, "GET", `/repos/${owner}/${repo}/git/ref/heads/master`);
    if (!alt.ok) return { ok: false, error: `branch ${branch} não encontrada: ${refRes.error}` };
    return pushOnRef(token, owner, repo, "master", files, opts.message, alt.data);
  }
  return pushOnRef(token, owner, repo, branch, files, opts.message, refRes.data);
}

async function pushOnRef(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: GhFile[],
  message: string | undefined,
  refData: unknown
): Promise<{ ok: true; output: string; commitSha: string; htmlUrl?: string } | { ok: false; error: string }> {
  const refObj = refData as { object?: { sha?: string } };
  const baseCommitSha = refObj.object?.sha;
  if (!baseCommitSha) return { ok: false, error: "SHA da branch ausente" };

  const commitRes = await ghJson(token, "GET", `/repos/${owner}/${repo}/git/commits/${baseCommitSha}`);
  if (!commitRes.ok) return commitRes;
  const baseTreeSha = (commitRes.data as { tree?: { sha?: string } }).tree?.sha;
  if (!baseTreeSha) return { ok: false, error: "tree SHA ausente" };

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

  const treeRes = await ghJson(token, "POST", `/repos/${owner}/${repo}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeItems,
  });
  if (!treeRes.ok) return treeRes;
  const newTreeSha = (treeRes.data as { sha?: string }).sha;
  if (!newTreeSha) return { ok: false, error: "nova tree sem sha" };

  const msg = (message || `Plutão: atualiza ${files.length} arquivo(s)`).slice(0, 500);
  const newCommit = await ghJson(token, "POST", `/repos/${owner}/${repo}/git/commits`, {
    message: msg,
    tree: newTreeSha,
    parents: [baseCommitSha],
  });
  if (!newCommit.ok) return newCommit;
  const newCommitSha = (newCommit.data as { sha?: string; html_url?: string }).sha;
  if (!newCommitSha) return { ok: false, error: "commit sem sha" };

  const updateRef = await ghJson(token, "PATCH", `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    sha: newCommitSha,
    force: false,
  });
  if (!updateRef.ok) return updateRef;

  const paths = files.map((f) => f.path).join(", ");
  return {
    ok: true,
    commitSha: newCommitSha,
    htmlUrl: (newCommit.data as { html_url?: string }).html_url,
    output: [
      `push ok: ${owner}/${repo}@${branch}`,
      `commit: ${newCommitSha}`,
      `arquivos (${files.length}): ${paths}`,
      `message: ${msg}`,
    ].join("\n"),
  };
}
