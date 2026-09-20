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
  missingArgs?: boolean;
  capability?: string;
  trace?: ToolCallTrace;
  contextText?: string;
  suggestedFollowUps?: Array<{ id: string; label: string; prompt: string }>;
};

export const GITHUB_REQUIRED_ARGS: Record<string, string[]> = {
  repos_list: [],
  repo_get: ["owner", "repo"],
  issues_list: ["owner", "repo"],
  issues_get: ["owner", "repo", "number"],
  pulls_list: ["owner", "repo"],
  actions_list: ["owner", "repo"],
};

export type GitHubToolPlan = {
  action: string;
  owner?: string;
  repo?: string;
  issueNumber?: number;
};

export function detectGitHubToolAction(text: string, defaultOwner?: string | null): GitHubToolPlan | null {
  const t = text.toLowerCase();

  const isGithubIntent =
    t.includes("github") ||
    t.includes("repo") ||
    t.includes("issue") ||
    t.includes("pull") ||
    t.includes("pr ") ||
    t.includes("prs") ||
    t.includes("action") ||
    t.includes("workflow");

  if (!isGithubIntent) {
    return null;
  }

  let action: string | null = null;
  let owner: string | undefined = defaultOwner ?? undefined;
  let repo: string | undefined = undefined;
  let issueNumber: number | undefined = undefined;

  const fullRepoMatch = text.match(/\b([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\b/);
  if (fullRepoMatch) {
    owner = fullRepoMatch[1];
    repo = fullRepoMatch[2];
  } else {
    const singleRepoMatch = text.match(/(?:repositório|repo)\s+([a-zA-Z0-9_.-]+)/i);
    if (singleRepoMatch) {
      repo = singleRepoMatch[1];
    }
  }

  if (t.includes("issue")) {
    const issueNumMatch = text.match(/issue\s*#?(\d+)/i);
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
    return null;
  }

  return {
    action,
    owner,
    repo,
    issueNumber,
  };
}

/**
 * Detects GitHub query intent from user text and executes the tool via Executor (runGithub).
 */
function extractRepoNamesFromSummary(summary: string): string[] {
  const names: string[] = [];
  const lines = summary.split("\n");
  for (const line of lines) {
    const match = line.match(/\s*-\s*(?:[a-zA-Z0-9_.-]+\/)?([a-zA-Z0-9_.-]+)/);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name && !names.includes(name) && name !== "showing") {
        names.push(name);
      }
    }
    if (names.length >= 3) break;
  }
  return names;
}

export async function detectAndExecuteGitHubTool(opts: {
  text: string;
  userId: string;
  githubLogin: string | null;
  missionId?: string | null;
}): Promise<GitHubToolExecutionResult> {
  const plan = detectGitHubToolAction(opts.text, opts.githubLogin);
  if (!plan) {
    return { executed: false };
  }

  const { action, owner, repo, issueNumber } = plan;

  const requiredArgs = GITHUB_REQUIRED_ARGS[action] ?? [];
  const missingParams: string[] = [];
  if (requiredArgs.includes("owner") && !owner) missingParams.push("owner");
  if (requiredArgs.includes("repo") && !repo) missingParams.push("repo");
  if (requiredArgs.includes("number") && issueNumber === undefined) missingParams.push("number");

  if (missingParams.length > 0) {
    let recentRepos: string[] = [];
    try {
      const silentRes = await runGithub(
        JSON.stringify({ action: "repos_list", per_page: 3 }),
        opts.userId
      );
      if (silentRes.ok && silentRes.output) {
        recentRepos = extractRepoNamesFromSummary(silentRes.output);
      }
    } catch {
      /* ignore silent fetch error */
    }

    const followUps = recentRepos.map((r, i) => {
      let prompt = `ver detalhes do repositório ${r}`;
      if (action.includes("issue")) {
        prompt = `liste as issues abertas de ${r}`;
      } else if (action.includes("pull") || action.includes("pr")) {
        prompt = `liste os pull requests de ${r}`;
      } else if (action.includes("action") || action.includes("workflow")) {
        prompt = `liste as actions de ${r}`;
      }
      return {
        id: `fu-missing-repo-${i + 1}`,
        label: r,
        prompt,
      };
    });

    const contextText = `[ESCLARECIMENTO DE PARÂMETROS - GITHUB]
O usuário quer executar '${action}', mas não especificou o repositório.
Repositórios recentes do usuário: ${recentRepos.length > 0 ? recentRepos.join(", ") : "nenhum encontrado"}.
Pergunte ao usuário qual repositório ele deseja consultar, oferecendo essas opções de forma objetiva e direta. NÃÔ tente adivinhar ou executar sem o usuário confirmar.`;

    return {
      executed: false,
      missingArgs: true,
      capability: action,
      contextText,
      suggestedFollowUps: followUps,
    };
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
