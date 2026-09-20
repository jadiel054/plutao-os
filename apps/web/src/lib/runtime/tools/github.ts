/**
 * Tool github — REST via token OAuth do conector do usuário.
 * Não roda sem status connected + access token válido.
 */

import { getConnectorRow } from "@/lib/connectors/service";
import { decryptToken } from "@/lib/connectors/crypto";
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

type GhAction =
  | "repos_list"
  | "repo_get"
  | "issues_list"
  | "issues_get"
  | "pulls_list"
  | "actions_list";

type GhPayload = {
  action: GhAction;
  owner?: string;
  repo?: string;
  number?: number;
  state?: string;
  per_page?: number;
};

function parseInput(raw: string): GhPayload | { error: string } {
  const t = raw.trim();
  if (!t) return { error: "input vazio — use JSON com action" };
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const action = String(j.action ?? "");
    const allowed: GhAction[] = [
      "repos_list",
      "repo_get",
      "issues_list",
      "issues_get",
      "pulls_list",
      "actions_list",
    ];
    if (!allowed.includes(action as GhAction)) {
      return {
        error: `action inválida. Use: ${allowed.join(", ")}`,
      };
    }
    return {
      action: action as GhAction,
      owner: j.owner ? String(j.owner) : undefined,
      repo: j.repo ? String(j.repo) : undefined,
      number: typeof j.number === "number" ? j.number : undefined,
      state: j.state ? String(j.state) : undefined,
      per_page:
        typeof j.per_page === "number"
          ? Math.min(30, Math.max(1, j.per_page))
          : 10,
    };
  } catch {
    return { error: "input deve ser JSON válido" };
  }
}

async function ghFetch(
  token: string,
  path: string
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Plutao-OS",
    },
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* plain */
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" &&
      data &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : `GitHub HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true, data };
}

function summarize(data: unknown, action: GhAction): string {
  if (Array.isArray(data)) {
    if (action === "repos_list") {
      const lines = data.slice(0, 15).map((r) => {
        const o = r as Record<string, unknown>;
        return `- ${o.full_name} (${o.private ? "private" : "public"}) · ${o.default_branch ?? ""}`;
      });
      return `repos (${data.length}${data.length > 15 ? ", showing 15" : ""}):\n${lines.join("\n")}`;
    }
    if (action === "issues_list" || action === "pulls_list") {
      const lines = data.slice(0, 15).map((r) => {
        const o = r as Record<string, unknown>;
        return `- #${o.number} [${o.state}] ${o.title}`;
      });
      return `${action} (${data.length}):\n${lines.join("\n") || "(vazio)"}`;
    }
    if (action === "actions_list") {
      const runs =
        typeof data === "object" && data && "workflow_runs" in data
          ? (data as { workflow_runs: unknown[] }).workflow_runs
          : data;
      if (!Array.isArray(runs)) return JSON.stringify(data).slice(0, 2000);
      const lines = runs.slice(0, 10).map((r) => {
        const o = r as Record<string, unknown>;
        return `- ${o.name} · ${o.status}/${o.conclusion ?? "—"} · ${o.html_url ?? ""}`;
      });
      return `workflow runs (${runs.length}):\n${lines.join("\n") || "(vazio)"}`;
    }
  }
  if (typeof data === "object" && data) {
    const o = data as Record<string, unknown>;
    if (action === "repo_get") {
      return [
        `repo: ${o.full_name}`,
        `default_branch: ${o.default_branch}`,
        `private: ${o.private}`,
        `description: ${o.description ?? "—"}`,
        `html_url: ${o.html_url}`,
      ].join("\n");
    }
    if (action === "issues_get") {
      return [
        `#${o.number} [${o.state}] ${o.title}`,
        `user: ${(o.user as { login?: string })?.login ?? "—"}`,
        String(o.body ?? "").slice(0, 800),
      ].join("\n");
    }
    if (action === "actions_list" && "workflow_runs" in o) {
      return summarize(o.workflow_runs, "actions_list");
    }
  }
  return JSON.stringify(data).slice(0, 2500);
}

export async function runGithub(input: string, userId: string): Promise<ToolResult> {
  const started = Date.now();
  const parsed = parseInput(input);
  if ("error" in parsed) {
    return {
      ok: false,
      tool: "github",
      input,
      error: parsed.error,
      durationMs: Date.now() - started,
    };
  }

  const row = await getConnectorRow(userId, "github");
  if (!row || row.status !== "connected" || !row.accessTokenEnc) {
    return {
      ok: false,
      tool: "github",
      input,
      error:
        "GitHub não conectado ou token indisponível. Conecte em Configurações → Conectores.",
      durationMs: Date.now() - started,
    };
  }

  const caps = parseCapabilities(row.capabilities);
  const cap = caps.find((c) => c.name === parsed.action);
  if (!cap) {
    return {
      ok: false,
      tool: "github",
      input,
      error: `Capability '${parsed.action}' não está autorizada no conector GitHub do usuário.`,
      durationMs: Date.now() - started,
    };
  }

  if (cap.mode === "write") {
    return {
      ok: false,
      tool: "github",
      input,
      error: `Ação de escrita '${parsed.action}' recusada: requer portão de confirmação humana (Princípio 1) ainda não implementado.`,
      durationMs: Date.now() - started,
    };
  }

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

  const per = parsed.per_page ?? 10;
  let path = "";

  switch (parsed.action) {
    case "repos_list":
      path = `/user/repos?per_page=${per}&sort=updated`;
      break;
    case "repo_get":
      if (!parsed.owner || !parsed.repo) {
        return {
          ok: false,
          tool: "github",
          input,
          error: "repo_get exige owner e repo",
          durationMs: Date.now() - started,
        };
      }
      path = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
      break;
    case "issues_list":
      if (!parsed.owner || !parsed.repo) {
        return {
          ok: false,
          tool: "github",
          input,
          error: "issues_list exige owner e repo",
          durationMs: Date.now() - started,
        };
      }
      path = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/issues?state=${encodeURIComponent(parsed.state ?? "open")}&per_page=${per}`;
      break;
    case "issues_get":
      if (!parsed.owner || !parsed.repo || parsed.number == null) {
        return {
          ok: false,
          tool: "github",
          input,
          error: "issues_get exige owner, repo e number",
          durationMs: Date.now() - started,
        };
      }
      path = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/issues/${parsed.number}`;
      break;
    case "pulls_list":
      if (!parsed.owner || !parsed.repo) {
        return {
          ok: false,
          tool: "github",
          input,
          error: "pulls_list exige owner e repo",
          durationMs: Date.now() - started,
        };
      }
      path = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/pulls?state=${encodeURIComponent(parsed.state ?? "open")}&per_page=${per}`;
      break;
    case "actions_list":
      if (!parsed.owner || !parsed.repo) {
        return {
          ok: false,
          tool: "github",
          input,
          error: "actions_list exige owner e repo",
          durationMs: Date.now() - started,
        };
      }
      path = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/actions/runs?per_page=${per}`;
      break;
    default:
      return {
        ok: false,
        tool: "github",
        input,
        error: "action não suportada",
        durationMs: Date.now() - started,
      };
  }

  const res = await ghFetch(token, path);
  if (!res.ok) {
    return {
      ok: false,
      tool: "github",
      input,
      error: res.error,
      durationMs: Date.now() - started,
    };
  }

  return {
    ok: true,
    tool: "github",
    input,
    output: summarize(res.data, parsed.action),
    durationMs: Date.now() - started,
  };
}
