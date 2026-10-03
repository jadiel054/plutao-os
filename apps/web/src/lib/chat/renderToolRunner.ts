/**
 * Runner Render — detecta intenção no chat e chama as ferramentas do Render.
 */

import { runRender } from "@/lib/runtime/tools/render";
import { getDb } from "@/lib/db";
import { missions } from "@plutao/db";
import { eq, and } from "drizzle-orm";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";

export type RenderToolCallTrace = {
  id: string;
  provider: "render";
  capability: string;
  input: Record<string, unknown> | string;
  output: string;
  status: "ok" | "error";
  durationMs: number;
  timestamp: string;
};

export type RenderToolExecutionResult = {
  executed: boolean;
  missingArgs?: boolean;
  capability?: string;
  trace?: RenderToolCallTrace;
  contextText?: string;
  suggestedFollowUps?: Array<{ id: string; label: string; prompt: string }>;
  output?: string;
  error?: string;
};

function wantsListServices(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("render") && !t.includes("serviço") && !t.includes("servico") && !t.includes("servicos") && !t.includes("serviços") && !t.includes("services")) return false;
  return (
    t.includes("listar") ||
    t.includes("liste") ||
    t.includes("meus") ||
    t.includes("services") ||
    t.includes("ver serviços") ||
    t.includes("ver servicos") ||
    t.includes("consultar") ||
    t.includes("mostrar")
  );
}

function wantsServiceGet(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("render") && !t.includes("serviço") && !t.includes("servico") && !t.includes("service")) return false;
  return (
    t.includes("detalhe") ||
    t.includes("detalhes") ||
    t.includes("info") ||
    t.includes("informações") ||
    t.includes("informacoes") ||
    t.includes("env") ||
    t.includes("variáveis") ||
    t.includes("variaveis")
  );
}

function wantsDeploysList(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("deploy") && !t.includes("deploys")) return false;
  return (
    t.includes("listar") ||
    t.includes("liste") ||
    t.includes("últimos") ||
    t.includes("ultimos") ||
    t.includes("histórico") ||
    t.includes("historico") ||
    t.includes("ver deploys") ||
    t.includes("deploys do")
  );
}

function wantsDeployTrigger(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("deploy") && !t.includes("render")) return false;
  return (
    t.includes("disparar") ||
    t.includes("trigger") ||
    t.includes("fazer deploy") ||
    t.includes("novo deploy") ||
    t.includes("redeploy") ||
    t.includes("publicar")
  );
}

function wantsEnvSet(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("env") && !t.includes("variável") && !t.includes("variavel")) return false;
  return (
    t.includes("definir") ||
    t.includes("set") ||
    t.includes("adicionar") ||
    t.includes("alterar") ||
    t.includes("configurar") ||
    t.includes("salvar")
  );
}

function extractServiceId(text: string): string | undefined {
  const m = text.match(/(?:service|serviço|servico|service_id|srv|id)\s*[:=]?\s*["']?([a-zA-Z0-9_-]+)["']?/i);
  if (!m) return undefined;
  const candidate = m[1];
  if (/^(service|serviço|servico|render|deploys|deploy|listar|ver|detalhes)$/i.test(candidate)) return undefined;
  return candidate;
}

export async function detectAndExecuteRenderTool(opts: {
  text?: string;
  userText?: string;
  userId: string;
  missionId?: string | null;
}): Promise<RenderToolExecutionResult> {
  const userText = opts.text ?? opts.userText ?? "";
  const userId = opts.userId;
  const timestamp = new Date().toISOString();

  if (wantsListServices(userText)) {
    const payload = { action: "services_list" };
    const res = await runRender(JSON.stringify(payload), userId);

    const trace: RenderToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "render",
      capability: "services_list",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR RENDER]\nCapability: services_list\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR RENDER]\nCapability: services_list\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "services_list", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  if (wantsServiceGet(userText)) {
    const sId = extractServiceId(userText);
    if (!sId) {
      return {
        executed: false,
        missingArgs: true,
        capability: "service_get",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - RENDER]\nO usuário deseja ver os detalhes do serviço Render, mas o parâmetro 'service_id' não foi informado.\nPeça para o usuário informar o 'service_id' (ex: srv-...).`,
      };
    }

    const payload = { action: "service_get", service_id: sId };
    const res = await runRender(JSON.stringify(payload), userId);

    const trace: RenderToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "render",
      capability: "service_get",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR RENDER]\nCapability: service_get\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR RENDER]\nCapability: service_get\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "service_get", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  if (wantsDeploysList(userText)) {
    const sId = extractServiceId(userText);
    if (!sId) {
      return {
        executed: false,
        missingArgs: true,
        capability: "deploys_list",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - RENDER]\nO usuário deseja listar os deploys, mas o parâmetro 'service_id' não foi informado.\nPeça para o usuário informar o 'service_id' do serviço Render.`,
      };
    }

    const payload = { action: "deploys_list", service_id: sId };
    const res = await runRender(JSON.stringify(payload), userId);

    const trace: RenderToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "render",
      capability: "deploys_list",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR RENDER]\nCapability: deploys_list\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR RENDER]\nCapability: deploys_list\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "deploys_list", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  if (wantsDeployTrigger(userText)) {
    const sId = extractServiceId(userText);
    if (!sId) {
      return {
        executed: false,
        missingArgs: true,
        capability: "deploy_trigger",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - RENDER]\nO usuário deseja disparar um deploy no Render, mas não informou o 'service_id'.\nPeça para o usuário informar o 'service_id'.`,
      };
    }

    const clearCache = userText.toLowerCase().includes("limpar cache") || userText.toLowerCase().includes("clear cache");
    const payload = { action: "deploy_trigger", service_id: sId, clear_cache: clearCache };
    const res = await runRender(JSON.stringify(payload), userId);

    const trace: RenderToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "render",
      capability: "deploy_trigger",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR RENDER]\nCapability: deploy_trigger\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR RENDER]\nCapability: deploy_trigger\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "deploy_trigger", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  if (wantsEnvSet(userText)) {
    const sId = extractServiceId(userText);
    const keyMatch = userText.match(/(?:chave|key|variavel|variável)\s*[:=]?\s*["']?([a-zA-Z0-9_]+)["']?/i);
    const valMatch = userText.match(/(?:valor|value)\s*[:=]?\s*["']?([^\s"']+)["']?/i);

    if (!sId || !keyMatch?.[1] || !valMatch?.[1]) {
      return {
        executed: false,
        missingArgs: true,
        capability: "env_set",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - RENDER]\nO usuário deseja definir uma variável de ambiente no Render, mas faltam parâmetros obrigatórios (service_id, key, value).\nPeça objetivamente as informações ao usuário.`,
      };
    }

    const payload = { action: "env_set", service_id: sId, key: keyMatch[1], value: valMatch[1] };
    const res = await runRender(JSON.stringify(payload), userId);

    const trace: RenderToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "render",
      capability: "env_set",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR RENDER]\nCapability: env_set\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR RENDER]\nCapability: env_set\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "env_set", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  return { executed: false };
}

async function maybeAppendMissionEvidence(
  missionId: string | null | undefined,
  userId: string,
  trace: RenderToolCallTrace,
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
      content: `tool:render capability:${trace.capability} → ${trace.output}`,
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
