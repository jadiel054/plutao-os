/**
 * Runner Cloudflare — detecta intenção no chat e chama as ferramentas do Cloudflare.
 */

import { runCloudflare } from "@/lib/runtime/tools/cloudflare";
import { getDb } from "@/lib/db";
import { missions } from "@plutao/db";
import { eq, and } from "drizzle-orm";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";

export type CloudflareToolCallTrace = {
  id: string;
  provider: "cloudflare";
  capability: string;
  input: Record<string, unknown> | string;
  output: string;
  status: "ok" | "error";
  durationMs: number;
  timestamp: string;
};

export type CloudflareToolExecutionResult = {
  executed: boolean;
  missingArgs?: boolean;
  capability?: string;
  trace?: CloudflareToolCallTrace;
  contextText?: string;
  suggestedFollowUps?: Array<{ id: string; label: string; prompt: string }>;
  output?: string;
  error?: string;
};

function wantsListZones(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("cloudflare") && !t.includes("zone") && !t.includes("domínio") && !t.includes("dominios")) return false;
  return (
    t.includes("zones") ||
    t.includes("zonas") ||
    t.includes("domínios") ||
    t.includes("dominios") ||
    t.includes("listar zones") ||
    t.includes("listar dominios")
  );
}

function wantsListDnsRecords(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("dns")) return false;
  return (
    t.includes("listar dns") ||
    t.includes("registros") ||
    t.includes("dns records") ||
    t.includes("ver dns") ||
    t.includes("consultar dns")
  );
}

function wantsListPages(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("pages")) return false;
  return (
    t.includes("listar") ||
    t.includes("projetos") ||
    t.includes("pages projects") ||
    t.includes("meus pages") ||
    t.includes("ver pages")
  );
}

function wantsListWorkers(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("worker") && !t.includes("workers")) return false;
  return (
    t.includes("listar") ||
    t.includes("scripts") ||
    t.includes("meus workers") ||
    t.includes("ver workers") ||
    t.includes("workers list")
  );
}

function wantsCreateDnsRecord(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("dns")) return false;
  return (
    t.includes("criar") ||
    t.includes("novo") ||
    t.includes("adicionar") ||
    t.includes("add") ||
    t.includes("record_create")
  );
}

function wantsDeployPages(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("pages") && !t.includes("cloudflare")) return false;
  return (
    t.includes("deploy") ||
    t.includes("publicar") ||
    t.includes("fazer deploy")
  );
}

function extractZoneId(text: string): string | undefined {
  const m = text.match(/(?:zone|zona|zone_id|id)\s*[:=]?\s*([a-f0-9]{32})/i);
  return m?.[1];
}

function extractProjectName(text: string): string | undefined {
  const m = text.match(/(?:projeto|project|pages)\s*["']?([a-zA-Z0-9_-]+)["']?/i);
  return m?.[1];
}

export async function detectAndExecuteCloudflareTool(opts: {
  text?: string;
  userText?: string;
  userId: string;
  missionId?: string | null;
}): Promise<CloudflareToolExecutionResult> {
  const userText = opts.text ?? opts.userText ?? "";
  const userId = opts.userId;
  const timestamp = new Date().toISOString();

  if (wantsListZones(userText)) {
    const payload = { action: "zones_list" };
    const res = await runCloudflare(JSON.stringify(payload), userId);

    const trace: CloudflareToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "cloudflare",
      capability: "zones_list",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR CLOUDFLARE]\nCapability: zones_list\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR CLOUDFLARE]\nCapability: zones_list\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "zones_list", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  if (wantsListDnsRecords(userText)) {
    const zoneId = extractZoneId(userText);
    if (!zoneId) {
      return {
        executed: false,
        missingArgs: true,
        capability: "dns_records_list",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - CLOUDFLARE]\nO usuário deseja listar registros DNS, mas o parâmetro 'zone_id' não foi especificado.\nPeça para o usuário informar o 'zone_id' do domínio.`,
      };
    }

    const payload = { action: "dns_records_list", zone_id: zoneId };
    const res = await runCloudflare(JSON.stringify(payload), userId);

    const trace: CloudflareToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "cloudflare",
      capability: "dns_records_list",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR CLOUDFLARE]\nCapability: dns_records_list\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR CLOUDFLARE]\nCapability: dns_records_list\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "dns_records_list", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  if (wantsListPages(userText)) {
    const payload = { action: "pages_projects_list" };
    const res = await runCloudflare(JSON.stringify(payload), userId);

    const trace: CloudflareToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "cloudflare",
      capability: "pages_projects_list",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR CLOUDFLARE]\nCapability: pages_projects_list\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR CLOUDFLARE]\nCapability: pages_projects_list\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "pages_projects_list", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  if (wantsListWorkers(userText)) {
    const payload = { action: "workers_list" };
    const res = await runCloudflare(JSON.stringify(payload), userId);

    const trace: CloudflareToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "cloudflare",
      capability: "workers_list",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR CLOUDFLARE]\nCapability: workers_list\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR CLOUDFLARE]\nCapability: workers_list\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "workers_list", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  if (wantsCreateDnsRecord(userText)) {
    const zoneId = extractZoneId(userText);
    const typeMatch = userText.match(/\b(A|AAAA|CNAME|TXT|MX|NS)\b/i);
    const nameMatch = userText.match(/nome\s*[:=]?\s*["']?([a-zA-Z0-9_.-]+)["']?/i);
    const contentMatch = userText.match(/(?:conteúdo|content|destino|ip)\s*[:=]?\s*["']?([^\s"']+)["']?/i);

    if (!zoneId || !nameMatch?.[1] || !contentMatch?.[1]) {
      return {
        executed: false,
        missingArgs: true,
        capability: "dns_record_create",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - CLOUDFLARE]\nO usuário deseja criar um registro DNS, mas faltam parâmetros obrigatórios (zone_id, name, content).\nPeça objetivamente as informações restantes ao usuário.`,
      };
    }

    const payload = {
      action: "dns_record_create",
      zone_id: zoneId,
      type: typeMatch?.[1] ? typeMatch[1].toUpperCase() : "A",
      name: nameMatch[1],
      content: contentMatch[1],
      proxied: userText.toLowerCase().includes("proxied"),
    };
    const res = await runCloudflare(JSON.stringify(payload), userId);

    const trace: CloudflareToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "cloudflare",
      capability: "dns_record_create",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR CLOUDFLARE]\nCapability: dns_record_create\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR CLOUDFLARE]\nCapability: dns_record_create\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "dns_record_create", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  if (wantsDeployPages(userText)) {
    const projName = extractProjectName(userText);
    if (!projName) {
      return {
        executed: false,
        missingArgs: true,
        capability: "pages_deploy",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - CLOUDFLARE]\nO usuário deseja criar um deployment no Cloudflare Pages, mas não especificou o nome do projeto (project_name).\nPeça para o usuário informar o nome do projeto Pages.`,
      };
    }

    const branchMatch = userText.match(/branch\s*[:=]?\s*["']?([a-zA-Z0-9_.-]+)["']?/i);
    const payload = {
      action: "pages_deploy",
      project_name: projName,
      branch: branchMatch?.[1] || "main",
    };
    const res = await runCloudflare(JSON.stringify(payload), userId);

    const trace: CloudflareToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "cloudflare",
      capability: "pages_deploy",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR CLOUDFLARE]\nCapability: pages_deploy\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR CLOUDFLARE]\nCapability: pages_deploy\nStatus: Erro (${res.durationMs}ms)\n${res.error}`;

    return { executed: true, capability: "pages_deploy", trace, contextText, output: res.ok ? res.output : undefined, error: res.ok ? undefined : res.error };
  }

  return { executed: false };
}

async function maybeAppendMissionEvidence(
  missionId: string | null | undefined,
  userId: string,
  trace: CloudflareToolCallTrace,
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
      content: `tool:cloudflare capability:${trace.capability} → ${trace.output}`,
      source: "tool_dispatcher",
      taskId: null,
      missionId,
      createdAt: trace.timestamp,
    };
    await db
      .update(missions)
      .set({ evidence: [...prevEv, evidenceItem], updatedAt: new Date() })
      .where(eq(missions.id, missionId));
  } catch {
    /* ignore */
  }
}
