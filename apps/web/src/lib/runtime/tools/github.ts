/**
 * Tool github — REST via token OAuth do conector do usuário.
 * Não roda sem status connected + access token válido.
 */

import { getConnectorRow } from "@/lib/connectors/service";
import { decryptToken } from "@/lib/connectors/crypto";
import { runRestCapability } from "@/lib/connectors/runRestCapability";
import { githubManifest } from "@/lib/connectors/manifests/github";
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

  const args: Record<string, unknown> = {
    owner: parsed.owner,
    repo: parsed.repo,
    number: parsed.number,
    state: parsed.state,
    per_page: parsed.per_page ?? 10,
  };

  const res = await runRestCapability(githubManifest, parsed.action, args, token);

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
    output: res.output,
    durationMs: Date.now() - started,
  };
}
