/**
 * Runner Vercel — detecta intenção e chama API oficial com token do conector.
 * Reads: direto. Writes: via runVercel → write_gate (Princípio 1).
 */

import { runVercel } from "@/lib/runtime/tools/vercel";
import { getDb } from "@/lib/db";
import { missions } from "@plutao/db";
import { eq, and } from "drizzle-orm";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { sanitizeText } from "@/lib/security/sanitize";

export type VercelToolCallTrace = {
  id: string;
  provider: "vercel";
  capability: string;
  input: Record<string, unknown> | string;
  output: string;
  status: "ok" | "error";
  durationMs: number;
  timestamp: string;
};

export type VercelToolExecutionResult = {
  executed: boolean;
  missingArgs?: boolean;
  capability?: string;
  trace?: VercelToolCallTrace;
  contextText?: string;
  suggestedFollowUps?: Array<{ id: string; label: string; prompt: string }>;
  output?: string;
  error?: string;
};

export const VERCEL_REQUIRED_ARGS: Record<string, string[]> = {
  projects_list: [],
  deployments_list: ["projectId"],
  deployment_get: ["deploymentId"],
  project_create: ["name"],
  deploy_create: ["name"],
};

export function isValidVercelProjectName(name?: string | null): boolean {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 51) return false;
  return /^[a-z0-9][a-z0-9-]{1,50}$/.test(trimmed);
}

function extractProjectNameCandidate(text: string): string | undefined {
  const patterns = [
    /(?:projeto|project|app|site)\s+(?:chamado|nome|named?)?\s*["']?([a-zA-Z0-9_.-]+)["']?/i,
    /(?:criar|create|publicar|deploy)\s+(?:um\s+)?(?:projeto|app|site)\s+["']?([a-zA-Z0-9_.-]+)["']?/i,
    /vercel[^\n]{0,40}["']([a-zA-Z0-9_.-]{2,40})["']/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (
      m?.[1] &&
      m[1].length >= 2 &&
      !/^(vercel|projeto|project|app|site|github|deploy|publicar)$/i.test(m[1])
    ) {
      return m[1];
    }
  }
  return undefined;
}

function extractGitRepo(text: string): string | undefined {
  const m = text.match(/\b([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\b/);
  if (m?.[1] && !m[1].startsWith("http")) return m[1];
  return undefined;
}

function wantsListProjects(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("vercel") && !t.includes("projeto") && !t.includes("project")) return false;
  return (
    t.includes("projeto") ||
    t.includes("project") ||
    t.includes("listar") ||
    t.includes("liste") ||
    t.includes("lista") ||
    t.includes("mostrar") ||
    t.includes("quais") ||
    t.includes("consulta") ||
    t.includes("consultar") ||
    t.includes("pode fazer") ||
    (t.includes("vercel") && (t.includes("conectado") || t.includes("meus")))
  );
}

function wantsListDeployments(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes("deploy") || t.includes("deployment") || t.includes("publica")) &&
    (t.includes("vercel") || t.includes("listar") || t.includes("liste") || t.includes("último") || t.includes("ultimo")) &&
    !/\b(criar|create|fazer|publicar\s+agora|novo)\b/.test(t)
  );
}

function wantsSpecificProjectDeployment(text: string): boolean {
  const t = text.toLowerCase();
  return (
    wantsListDeployments(text) &&
    (t.includes("projeto") || t.includes("project") || t.includes("do meu app") || t.includes("do app"))
  );
}

function extractProjectNamesFromData(data: unknown): string[] {
  const projects = Array.isArray((data as { projects?: unknown[] }).projects)
    ? (data as { projects: Array<Record<string, unknown>> }).projects
    : [];
  return projects
    .map((p) => String(p.name || p.id || "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function wantsCreateProject(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("vercel") && !t.includes("deploy") && !/\b(site|app|projeto)\b/.test(t)) {
    return false;
  }
  const listOnly = /\b(listar|liste|mostrar|mostre|quais)\b/.test(t);
  if (listOnly) return false;
  return (
    (/\b(criar|create|novo|gerar|gere|montar)\b/.test(t) &&
      /\b(projeto|project|app|site)\b/.test(t)) ||
    (/\b(publicar|hospedar)\b/.test(t) && /\b(vercel|site|app)\b/.test(t))
  );
}

function wantsCreateDeploy(text: string): boolean {
  const t = text.toLowerCase();
  if (wantsCreateProject(text)) return false;
  return (
    (/\b(deploy|deployment|publicar)\b/.test(t) &&
      /\b(criar|create|fazer|rodar|executar|agora)\b/.test(t)) ||
    (/\bdeploy\b/.test(t) && /\bvercel\b/.test(t) && !/\b(listar|liste|mostrar)\b/.test(t))
  );
}

function formatProjects(data: unknown): string {
  const projects = Array.isArray((data as { projects?: unknown[] }).projects)
    ? (data as { projects: Array<Record<string, unknown>> }).projects
    : [];
  if (projects.length === 0) return "Nenhum projeto encontrado nesta conta Vercel.";
  const lines = projects.map((p, i) => {
    const name = String(p.name || p.id || "project");
    const id = String(p.id || "");
    const framework = p.framework ? String(p.framework) : "—";
    return `${i + 1}. **${name}**\n   id: \`${id}\` · framework: ${framework}`;
  });
  return `Projetos Vercel (${projects.length}):\n\n${lines.join("\n\n")}`;
}

function formatDeployments(data: unknown): string {
  const deployments = Array.isArray((data as { deployments?: unknown[] }).deployments)
    ? (data as { deployments: Array<Record<string, unknown>> }).deployments
    : [];
  if (deployments.length === 0) return "Nenhum deployment encontrado.";
  const lines = deployments.map((d, i) => {
    const name = String(d.name || d.url || d.uid || "deploy");
    const state = String(d.readyState || d.state || "—");
    const url = d.url ? `https://${d.url}` : "";
    return `${i + 1}. **${name}** — ${state}${url ? `\n   ${url}` : ""}`;
  });
  return `Deployments recentes (${deployments.length}):\n\n${lines.join("\n\n")}`;
}

async function vercelGet(
  path: string,
  token: string
): Promise<{ ok: boolean; data: unknown; status: number; durationMs: number }> {
  const t0 = Date.now();
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status, durationMs: Date.now() - t0 };
}

export async function detectAndExecuteVercelTool(opts: {
  text?: string;
  userText?: string;
  userId?: string;
  accessToken: string;
  accountLogin?: string | null;
  missionId?: string | null;
}): Promise<VercelToolExecutionResult> {
  const userText = opts.text ?? opts.userText ?? "";
  const accessToken = opts.accessToken;
  const userId = opts.userId;
  const timestamp = new Date().toISOString();

  if (userId && wantsCreateProject(userText)) {
    const rawName = extractProjectNameCandidate(userText);
    const gitRepo = extractGitRepo(userText);
    const name = isValidVercelProjectName(rawName) ? rawName : undefined;
    if (!name) {
      return {
        executed: false,
        missingArgs: true,
        capability: "project_create",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - VERCEL]\nO usuário quer criar um projeto na Vercel, mas o nome informado ("${rawName ?? ""}") é inválido ou ausente.\nNomes de projetos Vercel devem ter pelo menos 3 caracteres, começar com letra/número e conter apenas letras minúsculas, números e hífens (/^[a-z0-9][a-z0-9-]{1,50}$/).\nPeça um nome válido ao usuário. A aprovação humana será o WriteGateCard.`,
      };
    }
    const payload: Record<string, unknown> = { action: "project_create", name };
    if (gitRepo) payload.gitRepo = gitRepo;
    if (/\bnext\b/i.test(userText)) payload.framework = "nextjs";
    else if (/\bvite\b/i.test(userText)) payload.framework = "vite";
    if (opts.missionId) payload.missionId = opts.missionId;

    const res = await runVercel(JSON.stringify(payload), userId);
    const isGatePending = Boolean(res.ok && res.output?.includes("GATE_PENDING"));
    const trace: VercelToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "vercel",
      capability: "project_create",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? isGatePending
        ? `[WRITE GATE — APROVAÇÃO HUMANA PENDENTE]\nCapability: project_create\nA tool NÃO executou a escrita na Vercel. Foi criado um write_gate.\nOutput:\n${res.output}\n\nInstrua o usuário de forma breve: a ação está no card de aprovação no chat (Aprovar / Recusar).\nNÃO peça nova confirmação em texto. Após aprovação no card, o runtime executa a escrita.`
        : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR VERCEL]\nCapability: project_create\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR VERCEL]\nCapability: project_create\nStatus: Erro\n${res.error}`;

    return { executed: true, capability: "project_create", trace, contextText };
  }

  if (userId && wantsCreateDeploy(userText)) {
    const rawName = extractProjectNameCandidate(userText);
    const gitRepo = extractGitRepo(userText);
    const candidateName = isValidVercelProjectName(rawName)
      ? rawName
      : gitRepo && isValidVercelProjectName(gitRepo.split("/")[1])
        ? gitRepo.split("/")[1]
        : undefined;

    if (!candidateName) {
      return {
        executed: false,
        missingArgs: true,
        capability: "deploy_create",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - VERCEL]\nO usuário quer criar um deployment, mas o nome do projeto informado ("${rawName ?? ""}") é inválido ou ausente.\nNomes de projetos Vercel devem ter pelo menos 3 caracteres e seguir o padrão /^[a-z0-9][a-z0-9-]{1,50}$/.\nPeça um nome de projeto válido ao usuário. Aprovação humana = WriteGateCard.`,
      };
    }
    const payload: Record<string, unknown> = {
      action: "deploy_create",
      name: candidateName,
    };
    if (gitRepo) payload.gitRepo = gitRepo;
    if (opts.missionId) payload.missionId = opts.missionId;

    const res = await runVercel(JSON.stringify(payload), userId);
    const isGatePending = Boolean(res.ok && res.output?.includes("GATE_PENDING"));
    const trace: VercelToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "vercel",
      capability: "deploy_create",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? isGatePending
        ? `[WRITE GATE — APROVAÇÃO HUMANA PENDENTE]\nCapability: deploy_create\nA tool NÃO executou o deploy. Foi criado um write_gate.\nOutput:\n${res.output}\n\nInstrua o usuário: aprovação no card do chat. Sem confirmação extra em texto.`
        : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR VERCEL]\nCapability: deploy_create\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR VERCEL]\nCapability: deploy_create\nStatus: Erro\n${res.error}`;

    return { executed: true, capability: "deploy_create", trace, contextText };
  }

  const run = async (
    capability: string,
    path: string,
    formatter: (data: unknown) => string
  ): Promise<VercelToolExecutionResult> => {
    const res = await vercelGet(path, accessToken);
    const output = res.ok
      ? formatter(res.data)
      : `Vercel API ${res.status}: ${JSON.stringify(res.data).slice(0, 240)}`;
    const trace: VercelToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "vercel",
      capability,
      input: { method: "GET", path },
      output,
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR VERCEL]\nCapability: ${capability}\nStatus: Sucesso (${res.durationMs}ms)\nDados:\n${output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR VERCEL]\nCapability: ${capability}\nStatus: Erro\n${output}`;
    return {
      executed: true,
      capability,
      trace,
      contextText,
      output: res.ok ? output : undefined,
      error: res.ok ? undefined : output,
    };
  };

  if (wantsSpecificProjectDeployment(userText)) {
    const projRes = await vercelGet("/v9/projects?limit=10", accessToken);
    const recentProjects = projRes.ok ? extractProjectNamesFromData(projRes.data) : [];
    const matchedProject = recentProjects.find((p) => userText.toLowerCase().includes(p.toLowerCase()));

    if (!matchedProject) {
      const followUps = recentProjects.map((p, i) => ({
        id: `fu-vercel-missing-proj-${i + 1}`,
        label: p,
        prompt: `mostre os deployments do projeto ${p} na Vercel`,
      }));

      const contextText = `[ESCLARECIMENTO DE PARÂMETROS - VERCEL]\nO usuário quer ver os deployments de um projeto na Vercel, mas não especificou qual projeto.\nProjetos recentes do usuário: ${recentProjects.length > 0 ? recentProjects.join(", ") : "nenhum encontrado"}.\nPergunte ao usuário qual projeto ele deseja consultar, oferecendo essas opções de forma objetiva e direta. Não tente adivinhar.`;

      return {
        executed: false,
        missingArgs: true,
        capability: "deployments_list",
        contextText,
        suggestedFollowUps: followUps,
      };
    }

    return run("deployments_list", `/v6/deployments?projectId=${encodeURIComponent(matchedProject)}&limit=15`, formatDeployments);
  }

  if (wantsListDeployments(userText)) {
    return run("deployments_list", "/v6/deployments?limit=15", formatDeployments);
  }

  if (wantsListProjects(userText)) {
    return run("projects_list", "/v9/projects?limit=20", formatProjects);
  }

  const t = userText.toLowerCase();
  if (t.includes("vercel") && (t.includes("consulta") || t.includes("pode") || t.includes("list"))) {
    return run("projects_list", "/v9/projects?limit=20", formatProjects);
  }

  return { executed: false };
}

async function maybeAppendMissionEvidence(
  missionId: string | null | undefined,
  userId: string,
  trace: VercelToolCallTrace,
  ok: boolean
) {
  if (!missionId) return;
  try {
    const db = getDb();
    const rows = await db
      .select({ evidence: missions.evidence })
      .from(missions)
      .where(and(eq(missions.id, missionId), eq(missions.userId, userId)))
      .limit(1);
    if (!rows[0]) return;
    const prevEv = parseEvidence(rows[0].evidence);
    const evidenceItem: EvidenceItem = {
      id: trace.id,
      type: ok ? "tool_result" : "tool_error",
      content: sanitizeText(`tool:vercel capability:${trace.capability} → ${trace.output}`),
      source: "tool_dispatcher",
      taskId: null,
      missionId,
      createdAt: trace.timestamp,
    };
    await db
      .update(missions)
      .set({ evidence: [...prevEv, evidenceItem], updatedAt: new Date() })
      .where(and(eq(missions.id, missionId), eq(missions.userId, userId)));
  } catch {
    /* ignore */
  }
}
