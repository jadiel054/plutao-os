/**
 * Supabase chat runner — detects natural language intent and executes Supabase capabilities.
 * Reads: direct execution. Writes (sql_exec): via runSupabase → write_gate (Princípio 1).
 */

import { runSupabase } from "@/lib/runtime/tools/supabase";
import { getDb } from "@/lib/db";
import { missions } from "@plutao/db";
import { eq, and } from "drizzle-orm";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";

export type SupabaseToolCallTrace = {
  id: string;
  provider: "supabase";
  capability: string;
  input: Record<string, unknown> | string;
  output: string;
  status: "ok" | "error";
  durationMs: number;
  timestamp: string;
};

export type SupabaseToolExecutionResult = {
  executed: boolean;
  missingArgs?: boolean;
  capability?: string;
  trace?: SupabaseToolCallTrace;
  contextText?: string;
  suggestedFollowUps?: Array<{ id: string; label: string; prompt: string }>;
  output?: string;
  error?: string;
};

function extractProjectRefCandidate(text: string): string | undefined {
  const patterns = [
    /(?:projeto|project_ref|ref)\s+["']?([a-zA-Z0-9_.-]{12,40})["']?/i,
    /ref[:=]\s*["']?([a-zA-Z0-9_.-]{12,40})["']?/i,
    /supabase[^\n]{0,30}["']([a-zA-Z0-9_.-]{12,40})["']/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1] && m[1].length >= 8 && !/^(supabase|projeto|project|tabela|table|schema)$/i.test(m[1])) {
      return m[1];
    }
  }
  return undefined;
}

function extractTableNameCandidate(text: string): string | undefined {
  const patterns = [
    /(?:tabela|table)\s+["']?([a-zA-Z0-9_.-]+)["']?/i,
    /(?:ler|select|consultar|dados\s+da)\s+tabela\s+["']?([a-zA-Z0-9_.-]+)["']?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1] && !/^(public|schema|supabase|projeto|project)$/i.test(m[1])) {
      return m[1];
    }
  }
  return undefined;
}

function extractSqlQueryCandidate(text: string): string | undefined {
  const match = text.match(/(?:sql|query|executar|rodar)\s*[:=]?\s*[`"']{1,3}([\s\S]+?)[`"']{1,3}/i);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }
  const sqlMatch = text.match(/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)\b[\s\S]+/i);
  if (sqlMatch?.[0]?.trim()) {
    return sqlMatch[0].trim();
  }
  return undefined;
}

function wantsListProjects(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("supabase")) return false;
  return (
    t.includes("projeto") ||
    t.includes("projetos") ||
    t.includes("listar") ||
    t.includes("liste") ||
    t.includes("mostrar") ||
    t.includes("quais")
  );
}

function wantsListTables(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes("tabela") || t.includes("tabelas") || t.includes("tables") || t.includes("schema")) &&
    (t.includes("supabase") || t.includes("listar") || t.includes("liste") || t.includes("mostrar")) &&
    !t.includes("ler") && !t.includes("dados")
  );
}

function wantsTableRead(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes("ler") || t.includes("consultar") || t.includes("dados") || t.includes("select")) &&
    (t.includes("tabela") || t.includes("table"))
  );
}

function wantsSqlExec(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes("sql") || t.includes("query") || t.includes("executar sql") || t.includes("run sql")) &&
    (t.includes("executar") || t.includes("rodar") || t.includes("run") || t.includes("fazer") || t.includes("criar") || t.includes("insert") || t.includes("update") || t.includes("delete"))
  );
}

export async function detectAndExecuteSupabaseTool(opts: {
  text?: string;
  userText?: string;
  userId: string;
  missionId?: string | null;
}): Promise<SupabaseToolExecutionResult> {
  const userText = opts.text ?? opts.userText ?? "";
  const userId = opts.userId;
  const timestamp = new Date().toISOString();

  if (wantsSqlExec(userText)) {
    const projectRef = extractProjectRefCandidate(userText);
    const query = extractSqlQueryCandidate(userText);

    if (!projectRef || !query) {
      return {
        executed: false,
        missingArgs: true,
        capability: "sql_exec",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - SUPABASE]\nO usuário solicitou execução de SQL no Supabase, mas faltam parâmetros [project_ref, query].\nPeça o ref do projeto e a instrução SQL a ser executada.`,
      };
    }

    const payload = {
      action: "sql_exec",
      projectRef,
      query,
      missionId: opts.missionId ?? undefined,
    };

    const res = await runSupabase(JSON.stringify(payload), userId);
    const isGatePending = Boolean(res.ok && res.output?.includes("GATE_PENDING"));
    const trace: SupabaseToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "supabase",
      capability: "sql_exec",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? isGatePending
        ? `[WRITE GATE — APROVAÇÃO HUMANA PENDENTE]\nCapability: sql_exec\nA tool NÃO executou a query no Supabase. Foi criado um write_gate.\nOutput:\n${res.output}\n\nInstrua o usuário: a aprovação está no card do chat (Aprovar / Recusar). Sem confirmação extra em texto.`
        : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR SUPABASE]\nCapability: sql_exec\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR SUPABASE]\nCapability: sql_exec\nStatus: Erro\n${res.error}`;

    return { executed: true, capability: "sql_exec", trace, contextText };
  }

  if (wantsTableRead(userText)) {
    const projectRef = extractProjectRefCandidate(userText);
    const table = extractTableNameCandidate(userText);

    if (!projectRef || !table) {
      return {
        executed: false,
        missingArgs: true,
        capability: "table_read",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - SUPABASE]\nO usuário quer consultar dados de uma tabela no Supabase, mas faltam os parâmetros [project_ref, table].\nPergunte objetivamente qual o projeto e a tabela que deseja consultar.`,
      };
    }

    const payload = {
      action: "table_read",
      projectRef,
      table,
      missionId: opts.missionId ?? undefined,
    };

    const res = await runSupabase(JSON.stringify(payload), userId);
    const trace: SupabaseToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "supabase",
      capability: "table_read",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR SUPABASE]\nCapability: table_read\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR SUPABASE]\nCapability: table_read\nStatus: Erro\n${res.error}`;

    return { executed: true, capability: "table_read", trace, contextText };
  }

  if (wantsListTables(userText)) {
    const projectRef = extractProjectRefCandidate(userText);
    if (!projectRef) {
      return {
        executed: false,
        missingArgs: true,
        capability: "tables_list",
        contextText: `[ESCLARECIMENTO DE PARÂMETROS - SUPABASE]\nO usuário quer listar as tabelas do Supabase, mas faltou informar o ref do projeto.\nPergunte qual o projeto (ref) do Supabase que deseja listar.`,
      };
    }

    const payload = {
      action: "tables_list",
      projectRef,
      missionId: opts.missionId ?? undefined,
    };

    const res = await runSupabase(JSON.stringify(payload), userId);
    const trace: SupabaseToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "supabase",
      capability: "tables_list",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR SUPABASE]\nCapability: tables_list\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR SUPABASE]\nCapability: tables_list\nStatus: Erro\n${res.error}`;

    return { executed: true, capability: "tables_list", trace, contextText };
  }

  if (wantsListProjects(userText)) {
    const payload = {
      action: "projects_list",
      missionId: opts.missionId ?? undefined,
    };

    const res = await runSupabase(JSON.stringify(payload), userId);
    const trace: SupabaseToolCallTrace = {
      id: crypto.randomUUID(),
      provider: "supabase",
      capability: "projects_list",
      input: payload,
      output: res.ok ? res.output : (res.error ?? "erro"),
      status: res.ok ? "ok" : "error",
      durationMs: res.durationMs,
      timestamp,
    };
    await maybeAppendMissionEvidence(opts.missionId, userId, trace, res.ok);

    const contextText = res.ok
      ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR SUPABASE]\nCapability: projects_list\nStatus: Sucesso (${res.durationMs}ms)\n${res.output}`
      : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR SUPABASE]\nCapability: projects_list\nStatus: Erro\n${res.error}`;

    return { executed: true, capability: "projects_list", trace, contextText };
  }

  return { executed: false };
}

async function maybeAppendMissionEvidence(
  missionId: string | null | undefined,
  userId: string,
  trace: SupabaseToolCallTrace,
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
      content: `tool:supabase capability:${trace.capability} → ${trace.output}`,
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
