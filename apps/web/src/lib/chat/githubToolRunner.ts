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
  repo_create: ["name"],
  push_files: ["owner", "repo", "files"],
};

export type GitHubToolPlan = {
  action: string;
  owner?: string;
  repo?: string;
  issueNumber?: number;
  name?: string;
  private?: boolean;
  description?: string;
  files?: Array<{ path: string; content: string }>;
  message?: string;
  branch?: string;
};

function extractRepoNameCandidate(text: string): string | undefined {
  const patterns = [
    /(?:chamado|nome|named?)\s+["']?([a-zA-Z0-9_.-]+)["']?/i,
    /(?:criar|create)\s+(?:um\s+)?(?:reposit[oó]rio|repo)\s+(?:p[uú]blico\s+|privado\s+)?(?:chamado\s+)?["']?([a-zA-Z0-9_.-]+)["']?/i,
    /(?:reposit[oó]rio|repo)\s+["']?([a-zA-Z0-9_.-]+)["']?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1] && m[1].length >= 2 && !/^(github|repo|reposit|publico|privado|com|um|uma)$/i.test(m[1])) {
      return m[1];
    }
  }
  return undefined;
}

function extractReadmeContent(text: string): string | null {
  const quoted = text.match(/README\.md[^"'\n]{0,40}["']([^"']{3,2000})["']/i);
  if (quoted?.[1]) return quoted[1].trim();
  const dizendo = text.match(/(?:dizendo|texto|conte[uú]do|com o texto)\s+["']([^"']{3,2000})["']/i);
  if (dizendo?.[1]) return dizendo[1].trim();
  const afterReadme = text.match(/README\.md[^.\n]{0,80}(?:que\s+)?(?:foi\s+)?(.{10,500})/i);
  if (afterReadme?.[1] && /plut[aã]o|pipeline|write\s*gate/i.test(afterReadme[1])) {
    return afterReadme[1].replace(/[.\s]+$/, "").trim();
  }
  return null;
}

export function detectGitHubToolAction(text: string, defaultOwner?: string | null): GitHubToolPlan | null {
  const t = text.toLowerCase();

  const isGithubIntent =
    t.includes("github") ||
    t.includes("repo") ||
    t.includes("reposit") ||
    t.includes("issue") ||
    t.includes("pull") ||
    t.includes("pr ") ||
    t.includes("prs") ||
    t.includes("readme") ||
    t.includes("commit") ||
    t.includes("push") ||
    /\b(action|workflow|pipeline)\b/.test(t);

  if (!isGithubIntent) {
    return null;
  }

  let action: string | null = null;
  let owner: string | undefined = defaultOwner ?? undefined;
  let repo: string | undefined = undefined;
  let issueNumber: number | undefined = undefined;
  let name: string | undefined = undefined;
  let isPrivate: boolean | undefined = undefined;
  let description: string | undefined = undefined;
  let files: Array<{ path: string; content: string }> | undefined = undefined;
  let commitMessage: string | undefined = undefined;

  const fullRepoMatch = text.match(/\b([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\b/);
  if (fullRepoMatch) {
    owner = fullRepoMatch[1];
    repo = fullRepoMatch[2];
  } else {
    const singleRepoMatch = text.match(/(?:reposit[oó]rio|repo)\s+([a-zA-Z0-9_.-]+)/i);
    if (singleRepoMatch) {
      repo = singleRepoMatch[1];
    }
  }

  const wantsCreate =
    /\b(criar|create|novo)\b/.test(t) &&
    /\b(reposit[oó]rio|repo)\b/.test(t) &&
    !/\b(n[aã]o\s+consigo\s+criar|n[aã]o\s+posso\s+criar)\b/.test(t);

  const wantsPush =
    /\b(push|enviar\s+arquivo|commit|atualizar\s+arquivo|adicionar\s+(?:o\s+)?(?:arquivo\s+)?readme|readme\.md)\b/.test(
      t
    ) && !wantsCreate;

  // Writes first — otherwise "pipeline" / "repo" false-positives steal the intent.
  if (wantsCreate) {
    action = "repo_create";
    name = extractRepoNameCandidate(text) || repo;
    if (t.includes("privado") || t.includes("private")) isPrivate = true;
    else if (t.includes("públic") || t.includes("public") || t.includes("publico")) isPrivate = false;
    else isPrivate = false;
    description = "Criado pelo Plutão";
    const readmeBody = extractReadmeContent(text);
    // README goes in a follow-up push after create+approve; keep description only here.
    if (readmeBody) {
      description = readmeBody.slice(0, 350);
    }
  } else if (wantsPush) {
    action = "push_files";
    const readmeBody =
      extractReadmeContent(text) ||
      (t.includes("readme") ? "Criado pelo pipeline de write gate do Plutão" : null);
    if (readmeBody) {
      files = [{ path: "README.md", content: readmeBody + (readmeBody.endsWith("\n") ? "" : "\n") }];
      commitMessage = "docs: README via Plutão write gate";
    }
    if (!repo) {
      const n = extractRepoNameCandidate(text);
      if (n) repo = n;
    }
  } else if (t.includes("issue")) {
    const issueNumMatch = text.match(/issue\s*#?(\d+)/i);
    if (issueNumMatch) {
      action = "issues_get";
      issueNumber = parseInt(issueNumMatch[1], 10);
    } else {
      action = "issues_list";
    }
  } else if (t.includes("pull") || t.includes("pr ") || t.includes("prs")) {
    action = "pulls_list";
  } else if (\b(action|workflow|pipeline)\b/.test(t) && !t.includes("write gate")) {
    action = "actions_list";
  } else if (t.includes("repositório") || t.includes("repositorio") || t.includes("repos") || t.includes("repo")) {
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
    name,
    private: isPrivate,
    description,
    files,
    message: commitMessage,
  };
}

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

  const { action, owner, repo, issueNumber, name, private: isPrivate, description, files, message } =
    plan;

  const requiredArgs = GITHUB_REQUIRED_ARGS[action] ?? [];
  const missingParams: string[] = [];
  if (requiredArgs.includes("owner") && !owner) missingParams.push("owner");
  if (requiredArgs.includes("repo") && !repo) missingParams.push("repo");
  if (requiredArgs.includes("number") && issueNumber === undefined) missingParams.push("number");
  if (requiredArgs.includes("name") && !name) missingParams.push("name");
  if (requiredArgs.includes("files") && (!files || files.length === 0)) missingParams.push("files");

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
      if (action === "push_files") {
        prompt = `envie README.md para o repositório ${r}`;
      } else if (action.includes("issue")) {
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
O usuário quer executar '${action}', mas faltam: ${missingParams.join(", ")}.
Repositórios recentes: ${recentRepos.length > 0 ? recentRepos.join(", ") : "nenhum encontrado"}.
Peça só o mínimo que falta (ex.: nome do repositório). Não peça confirmação genérica de "posso executar?".
Para escritas (repo_create / push_files), assim que os args existirem, execute a tool — a aprovação humana é o WriteGateCard, não o chat.`;

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
  if (name) payload.name = name;
  if (typeof isPrivate === "boolean") payload.private = isPrivate;
  if (description) payload.description = description;
  if (files) payload.files = files;
  if (message) payload.message = message;
  if (opts.missionId) payload.missionId = opts.missionId;

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

  const isGatePending = Boolean(res.ok && res.output?.includes("GATE_PENDING"));

  const contextText = res.ok
    ? isGatePending
      ? `[WRITE GATE — APROVAÇÃO HUMANA PENDENTE]
Capability: ${action}
A tool NÃO executou a escrita no GitHub. Foi criado um write_gate.
Output da tool:
${res.output}

Instrua o usuário de forma breve: a ação está no card de aprovação no chat (Aprovar / Recusar).
NÃO peça nova confirmação em texto. NÃO diga que não consegue criar. NÃO ofereça guia manual/CLI.
Após aprovação no card, o runtime executa a escrita.`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR GITHUB]
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
