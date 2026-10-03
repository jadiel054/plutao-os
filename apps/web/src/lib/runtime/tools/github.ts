/**
 * Tool github — REST via token OAuth do conector do usuário.
 * Reads: executam direto.
 * Writes: criam write_gate (pending) até aprovação humana; depois executam.
 */

import { getConnectorRow } from "@/lib/connectors/service";
import { decryptToken } from "@/lib/connectors/crypto";
import { runRestCapability } from "@/lib/connectors/runRestCapability";
import { githubManifest } from "@/lib/connectors/manifests/github";
import { githubCreateRepo } from "@/lib/connectors/githubWrite";
import { githubWriteFilesWithToken } from "@/lib/connectors/githubFiles";
import { githubBranchesList, githubBranchesCreate } from "@/lib/connectors/githubBranches";
import { githubPullsCreate, githubPullsList, githubPullsGet } from "@/lib/connectors/githubPulls";
import { githubCodeSearch, githubTree } from "@/lib/connectors/githubCode";
import { createWriteGate } from "@/lib/connectors/gates";
import type { ConnectorCapability } from "@plutao/domain";
import type { ToolResult } from "./types";

function parseCapabilities(raw: unknown): ConnectorCapability[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      name: String(c.name ?? ""),
      description: c.description ? String(c.description) : undefined,
      kind: c.kind === "mcp_tool" ? ("mcp_tool" as const) : ("rest_api" as const),
      mode: c.mode === "write" ? ("write" as const) : ("read" as const),
    }))
    .filter((c) => c.name.length > 0);
}

const READ_ACTIONS = [
  "repos_list",
  "repo_get",
  "issues_list",
  "issues_get",
  "pulls_list",
  "actions_list",
  "github.branches.list",
  "branches_list",
  "github.prs.list",
  "prs_list",
  "github.prs.get",
  "prs_get",
  "github.code.search",
  "code_search",
  "github.tree",
  "tree",
] as const;

const WRITE_ACTIONS = [
  "repo_create",
  "push_files",
  "github.files.write",
  "github.branches.create",
  "branches_create",
  "github.prs.create",
  "prs_create",
] as const;

type GhAction = (typeof READ_ACTIONS)[number] | (typeof WRITE_ACTIONS)[number];

type GhPayload = {
  action: GhAction;
  owner?: string;
  repo?: string;
  number?: number;
  state?: "open" | "closed" | "all";
  per_page?: number;
  name?: string;
  private?: boolean;
  description?: string;
  files?: Array<{ path: string; content: string }>;
  message?: string;
  branch?: string;
  from_branch?: string;
  title?: string;
  body?: string;
  head?: string;
  base?: string;
  query?: string;
  tree_sha?: string;
  recursive?: boolean;
  _gateApproved?: boolean;
  _gateId?: string;
  missionId?: string;
};

function parseInput(raw: string): GhPayload | { error: string } {
  const t = raw.trim();
  if (!t) return { error: "input vazio — use JSON com action" };
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const action = String(j.action ?? "");
    const allowed = [...READ_ACTIONS, ...WRITE_ACTIONS];
    if (!allowed.includes(action as GhAction)) {
      return { error: `action inválida. Use: ${allowed.join(", ")}` };
    }
    const files = Array.isArray(j.files)
      ? (j.files as unknown[])
          .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
          .map((f) => ({ path: String(f.path ?? ""), content: String(f.content ?? "") }))
          .filter((f) => f.path.length > 0)
      : undefined;

    return {
      action: action as GhAction,
      owner: j.owner ? String(j.owner) : undefined,
      repo: j.repo ? String(j.repo) : undefined,
      number: typeof j.number === "number" ? j.number : undefined,
      state: j.state === "closed" || j.state === "all" || j.state === "open" ? (j.state as "open" | "closed" | "all") : undefined,
      per_page: typeof j.per_page === "number" ? Math.min(30, Math.max(1, j.per_page)) : 10,
      name: j.name ? String(j.name) : undefined,
      private: typeof j.private === "boolean" ? j.private : undefined,
      description: j.description ? String(j.description) : undefined,
      files,
      message: j.message ? String(j.message) : undefined,
      branch: j.branch ? String(j.branch) : undefined,
      from_branch: j.from_branch ? String(j.from_branch) : undefined,
      title: j.title ? String(j.title) : undefined,
      body: j.body ? String(j.body) : undefined,
      head: j.head ? String(j.head) : undefined,
      base: j.base ? String(j.base) : undefined,
      query: j.query ? String(j.query) : undefined,
      tree_sha: j.tree_sha ? String(j.tree_sha) : undefined,
      recursive: typeof j.recursive === "boolean" ? j.recursive : true,
      _gateApproved: j._gateApproved === true,
      _gateId: j._gateId ? String(j._gateId) : undefined,
      missionId: j.missionId ? String(j.missionId) : undefined,
    };
  } catch {
    return { error: "input deve ser JSON válido" };
  }
}

function previewFiles(files?: Array<{ path: string; content: string }>): string {
  if (!files?.length) return "(sem arquivos)";
  return files
    .slice(0, 12)
    .map((f) => `- ${f.path} (${f.content.length} chars)`)
    .join("\n");
}

export async function runGithub(input: string, userId: string): Promise<ToolResult> {
  const started = Date.now();
  const parsed = parseInput(input);
  if ("error" in parsed) {
    return { ok: false, tool: "github", input, error: parsed.error, durationMs: Date.now() - started };
  }

  const row = await getConnectorRow(userId, "github");
  if (!row || row.status !== "connected" || !row.accessTokenEnc) {
    return {
      ok: false,
      tool: "github",
      input,
      error: "GitHub não conectado ou token indisponível. Conecte em Configurações → Conectores.",
      durationMs: Date.now() - started,
    };
  }

  const caps = parseCapabilities(row.capabilities);
  const manifestCap = githubManifest.capabilities.find((c) => c.name === parsed.action);
  const cap =
    caps.find((c) => c.name === parsed.action) ||
    (manifestCap
      ? {
          name: manifestCap.name,
          description: manifestCap.description,
          kind: "rest_api" as const,
          mode: manifestCap.mode,
        }
      : null) ||
    // Fallback cap check for short names if manifest lists full prefixed names
    (WRITE_ACTIONS.includes(parsed.action as (typeof WRITE_ACTIONS)[number])
      ? { name: parsed.action, mode: "write" as const, kind: "rest_api" as const }
      : { name: parsed.action, mode: "read" as const, kind: "rest_api" as const });

  let token: string | null = null;
  try {
    token = decryptToken(row.accessTokenEnc);
  } catch {
    token = null;
  }
  if (!token) {
    return {
      ok: false,
      tool: "github",
      input,
      error: "Falha ao descriptografar token do conector GitHub.",
      durationMs: Date.now() - started,
    };
  }

  const isWrite =
    cap.mode === "write" || WRITE_ACTIONS.includes(parsed.action as (typeof WRITE_ACTIONS)[number]);

  if (isWrite && !parsed._gateApproved) {
    const target =
      parsed.action === "repo_create"
        ? `github.com/new/${parsed.name || "repo"}`
        : `${parsed.owner || row.accountLogin || "?"}/${parsed.repo || "?"}`;

    let summary = `Push de ${parsed.files?.length ?? 0} arquivo(s) em ${target}`;
    if (parsed.action === "repo_create") {
      summary = `Criar repositório "${parsed.name}" (${parsed.private ? "privado" : "público"})`;
    } else if (parsed.action === "github.branches.create" || parsed.action === "branches_create") {
      summary = `Criar branch "${parsed.branch}" em ${target}`;
    } else if (parsed.action === "github.prs.create" || parsed.action === "prs_create") {
      summary = `Abrir PR "${parsed.title}" (${parsed.head} → ${parsed.base}) em ${target}`;
    }

    const contentPreview =
      parsed.action === "push_files" || parsed.action === "github.files.write"
        ? previewFiles(parsed.files)
        : parsed.description || parsed.body || null;

    try {
      const gate = await createWriteGate({
        userId,
        missionId: parsed.missionId ?? null,
        provider: "github",
        capability: parsed.action,
        target,
        summary,
        payload: {
          action: parsed.action,
          owner: parsed.owner,
          repo: parsed.repo,
          name: parsed.name,
          private: parsed.private,
          description: parsed.description,
          files: parsed.files,
          message: parsed.message,
          branch: parsed.branch,
          from_branch: parsed.from_branch,
          title: parsed.title,
          body: parsed.body,
          head: parsed.head,
          base: parsed.base,
        },
        contentPreview,
      });

      return {
        ok: true,
        tool: "github",
        input,
        output: [
          "GATE_PENDING",
          `gate_id: ${gate.id}`,
          `capability: ${parsed.action}`,
          `target: ${target}`,
          `summary: ${summary}`,
          "Aguardando aprovação humana no chat (Princípio 1). Não execute write sem aprovação.",
        ].join("\n"),
        durationMs: Date.now() - started,
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Falha ao criar write_gate";
      console.error("[runGithub createWriteGate error]", { action: parsed.action, input, error: reason });
      return {
        ok: false,
        tool: "github",
        input,
        error: `Não consegui iniciar a operação ${parsed.action}: ${reason}`,
        durationMs: Date.now() - started,
      };
    }
  }

  // Execute Action Handlers
  if (parsed.action === "repo_create") {
    const res = await githubCreateRepo(token, {
      name: parsed.name || "plutao-project",
      private: parsed.private,
      description: parsed.description,
    });
    if (!res.ok) {
      return { ok: false, tool: "github", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "github", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "push_files" || parsed.action === "github.files.write") {
    const owner = parsed.owner || row.accountLogin || "";
    const res = await githubWriteFilesWithToken(token, {
      owner,
      repo: parsed.repo || "",
      files: parsed.files || [],
      message: parsed.message,
      branch: parsed.branch,
    });
    if (!res.ok) {
      return { ok: false, tool: "github", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "github", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "github.branches.list" || parsed.action === "branches_list") {
    const owner = parsed.owner || row.accountLogin || "";
    const res = await githubBranchesList(token, {
      owner,
      repo: parsed.repo || "",
      per_page: parsed.per_page,
    });
    if (!res.ok) {
      return { ok: false, tool: "github", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "github", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "github.branches.create" || parsed.action === "branches_create") {
    const owner = parsed.owner || row.accountLogin || "";
    const res = await githubBranchesCreate(token, {
      owner,
      repo: parsed.repo || "",
      branch: parsed.branch || "",
      from_branch: parsed.from_branch,
    });
    if (!res.ok) {
      return { ok: false, tool: "github", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "github", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "github.prs.create" || parsed.action === "prs_create") {
    const owner = parsed.owner || row.accountLogin || "";
    const res = await githubPullsCreate(token, {
      owner,
      repo: parsed.repo || "",
      title: parsed.title || "Pull Request via Plutão OS",
      body: parsed.body,
      head: parsed.head || "",
      base: parsed.base || "main",
    });
    if (!res.ok) {
      return { ok: false, tool: "github", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "github", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "github.prs.list" || parsed.action === "prs_list") {
    const owner = parsed.owner || row.accountLogin || "";
    const res = await githubPullsList(token, {
      owner,
      repo: parsed.repo || "",
      state: parsed.state,
      per_page: parsed.per_page,
    });
    if (!res.ok) {
      return { ok: false, tool: "github", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "github", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "github.prs.get" || parsed.action === "prs_get") {
    const owner = parsed.owner || row.accountLogin || "";
    const res = await githubPullsGet(token, {
      owner,
      repo: parsed.repo || "",
      number: parsed.number || 0,
    });
    if (!res.ok) {
      return { ok: false, tool: "github", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "github", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "github.code.search" || parsed.action === "code_search") {
    const owner = parsed.owner || row.accountLogin || "";
    const res = await githubCodeSearch(token, {
      owner,
      repo: parsed.repo || "",
      query: parsed.query || "",
      per_page: parsed.per_page,
    });
    if (!res.ok) {
      return { ok: false, tool: "github", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "github", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "github.tree" || parsed.action === "tree") {
    const owner = parsed.owner || row.accountLogin || "";
    const res = await githubTree(token, {
      owner,
      repo: parsed.repo || "",
      tree_sha: parsed.tree_sha,
      recursive: parsed.recursive,
    });
    if (!res.ok) {
      return { ok: false, tool: "github", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "github", input, output: res.output, durationMs: Date.now() - started };
  }

  const args: Record<string, unknown> = {
    owner: parsed.owner,
    repo: parsed.repo,
    number: parsed.number,
    state: parsed.state,
    per_page: parsed.per_page ?? 10,
  };

  const res = await runRestCapability(githubManifest, parsed.action, args, token);

  if (!res.ok) {
    return { ok: false, tool: "github", input, error: res.error, durationMs: Date.now() - started };
  }

  return {
    ok: true,
    tool: "github",
    input,
    output: res.output,
    durationMs: Date.now() - started,
  };
}
