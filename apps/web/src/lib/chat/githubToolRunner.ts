import { runGithub } from "@/lib/runtime/tools/github";
import { getDb } from "@/lib/db";
import { missions } from "@plutao/db";
import { eq, and } from "drizzle-orm";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";

export type ToolCallTrace = {
  id: string;
  provider: "github";
  capability: string;
  input: Record<string, unknown> | string;
  output: string;
  status: "ok" | "error";
  durationMs: number;
  timestamp: string;
};

export type GitHubToolExecutionResult = {
  executed: boolean;
  capability?: string;
  trace?: ToolCallTrace;
  contextText?: string;
};

/**
 * Detects GitHub query intent from user text and executes the tool via Executor (runGithub).
 */
export async function detectAndExecuteGitHubTool(opts: {
  text: string;
  userId: string;
  githubLogin: string | null;
  missionId?: string | null;
}): Promise<GitHubToolExecutionResult> {
  const t = opts.text.toLowerCase();

  // Basic intent keywords check
  const isGithubIntent =
    t.includes("github") ||
    t.includes("repo") ||
    t.includes("issue") ||
    t.includes("pull") ||
    t.includes("pr ") ||
    t.includes("action") ||
    t.includes("workflow");

  if (!isGithubIntent) {
    return { executed: false };
  }

  let action: string | null = null;
  let owner: string | undefined = opts.githubLogin ?? undefined;
  let repo: string | undefined = undefined;
  let issueNumber: number | undefined = undefined;

  // Extract owner/repo if present: "owner/repo" or "repositório X" or "repo Y"
  const fullRepoMatch = opts.text.match(/\b([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\b/);
  if (fullRepoMatch) {
    owner = fullRepoMatch[1];
    repo = fullRepoMatch[2];
  } else {
    const singleRepoMatch = opts.text.match(/(?:repositório|repo)\s+([a-zA-Z0-9_.-]+)/i);
    if (singleRepoMatch) {
      repo = singleRepoMatch[1];
    }
  }

  // Determine action
  if (t.includes("issue")) {
    const issueNumMatch = opts.text.match(/issue\s*#?(\d+)/i);
    if (issueNumMatch) {
      action = "issues_get";
      issueNumber = parseInt(issueNumMatch[1], 10);
    } else {
      action = "issues_list";
    }
  } else if (t.includes("pull") || t.includes("pr ") || t.includes("prs")) {
    action = "pulls_list";
  } else if (t.includes("action") || t.includes("workflow") || t.includes("pipeline")) {
    action = "actions_list";
  } else if (t.includes("repositório") || t.includes("repos") || t.includes("repo")) {
    if (repo && (t.includes("detalhes") || t.includes("sobre") || t.includes("info"))) {
      action = "repo_get";
    } else {
      action = "repos_list";
    }
  }

  if (!action) {
    return { executed: false };
  }

  const payload: Record<string, unknown> = { action };
  if (owner) payload.owner = owner;
  if (repo) payload.repo = repo;
  if (issueNumber !== undefined) payload.number = issueNumber;

  const rawInput = JSON.stringify(payload);
  const startedAt = new Date();
  const res = await runGithub(rawInput, opts.userId);

  const timestamp = startedAt.toISOString();
  const trace: ToolCallTrace = {
    id: crypto.randomUUID(),
    provider: "github",
    capability: action,
    input: payload,
    output: res.ok ? res.output : (res.error ?? "Erro desconhecido"),
    status: res.ok ? "ok" : "error",
    durationMs: res.durationMs,
    timestamp,
  };

  // Persist evidence to active mission if missionId is supplied
  if (opts.missionId) {
    try {
      const db = getDb();
      const rows = await db
        .select({ evidence: missions.evidence })
        .from(missions)
        .where(and(eq(missions.id, opts.missionId), eq(missions.userId, opts.userId)))
        .limit(1);

      if (rows[0]) {
        const prevEv = parseEvidence(rows[0].evidence);
        const evidenceItem: EvidenceItem = {
          id: trace.id,
          type: res.ok ? "tool_result" : "tool_error",
          content: `tool:github capability:${action} → ${trace.output}`,
          source: "tool_dispatcher",
          taskId: null,
          missionId: opts.missionId,
          createdAt: timestamp,
        };

        await db
          .update(missions)
          .set({ evidence: [...prevEv, evidenceItem], updatedAt: new Date() })
          .where(eq(missions.id, opts.missionId));
      }
    } catch {
      /* ignore evidence save error */
    }
  }

  const contextText = res.ok
    ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR GITHUB]
Capability executada: ${action}
Status: Sucesso (${res.durationMs}ms)
Dados retornados da API do GitHub:
${res.output}`
    : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR GITHUB]
Capability executada: ${action}
Status: Erro (${res.durationMs}ms)
Mensagem de erro: ${res.error}`;

  return {
    executed: true,
    capability: action,
    trace,
    contextText,
  };
}
