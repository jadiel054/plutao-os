/**
 * Tool supabase — REST via token PAT e credentials do conector do usuário.
 *
 * Reads: executam direto (sujeitos ao registro de capacidades).
 *   - `table_read` usa FILTROS ESTRUTURADOS (H4): `where` livre é rejeitado e
 *     nunca é concatenado em SQL/URL.
 * Writes (`sql_exec`): exigem write_gate aprovado por humano, validado no
 * servidor. O booleano `_gateApproved` foi REMOVIDO.
 */

import { getConnectorRow } from "@/lib/connectors/service";
import { guardWrite, type GateFinalize } from "@/lib/connectors/writeGateGuard";
import { capabilityBlockReason } from "@/lib/capabilities/registry";
import {
  getSupabaseCredentials,
  isQueryBlocklisted,
  supabaseListProjects,
  supabaseListTables,
  supabaseTableRead,
  supabaseSqlExec,
} from "@/lib/connectors/supabaseWrite";
import type { ToolResult } from "./types";

const READ_ACTIONS = ["projects_list", "tables_list", "table_read"] as const;
const WRITE_ACTIONS = ["sql_exec"] as const;

type SupabaseAction = (typeof READ_ACTIONS)[number] | (typeof WRITE_ACTIONS)[number];

type SupabasePayload = {
  action: SupabaseAction;
  projectRef?: string;
  table?: string;
  limit?: number;
  select?: string;
  where?: string;
  query?: string;
  /** H1 — id do write_gate aprovado. Único campo de autorização aceito. */
  _gateId?: string;
  missionId?: string;
};

function parseInput(raw: string): SupabasePayload | { error: string } {
  const t = raw.trim();
  if (!t) return { error: "input vazio — use JSON com action" };
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const action = String(j.action ?? j.tool ?? "");
    const allowed = [...READ_ACTIONS, ...WRITE_ACTIONS];
    if (!allowed.includes(action as SupabaseAction)) {
      return { error: `action inválida. Use: ${allowed.join(", ")}` };
    }

    return {
      action: action as SupabaseAction,
      projectRef: j.projectRef
        ? String(j.projectRef)
        : j.project_ref
          ? String(j.project_ref)
          : undefined,
      table: j.table ? String(j.table) : undefined,
      limit: typeof j.limit === "number" ? Math.min(100, Math.max(1, j.limit)) : 50,
      select: j.select ? String(j.select) : "*",
      where: j.where ? String(j.where) : undefined,
      query: j.query ? String(j.query) : undefined,
      _gateId: j._gateId ? String(j._gateId) : undefined,
      missionId: j.missionId ? String(j.missionId) : undefined,
    };
  } catch {
    return { error: "input deve ser JSON válido" };
  }
}

/** Payload normalizado que entra no hash do gate. */
function buildWritePayload(parsed: SupabasePayload): Record<string, unknown> {
  return {
    projectRef: parsed.projectRef,
    query: parsed.query,
  };
}

export async function runSupabase(input: string, userId: string, executionId?: string): Promise<ToolResult> {
  const started = Date.now();
  const parsed = parseInput(input);
  if ("error" in parsed) {
    return {
      ok: false,
      tool: "supabase",
      input,
      error: parsed.error,
      durationMs: Date.now() - started,
    };
  }

  // H9 — registro de capacidades (fail-closed).
  const blocked = capabilityBlockReason("supabase", parsed.action);
  if (blocked) {
    return { ok: false, tool: "supabase", input, error: blocked, durationMs: Date.now() - started };
  }

  const row = await getConnectorRow(userId, "supabase");
  if (!row || row.status !== "connected") {
    return {
      ok: false,
      tool: "supabase",
      input,
      error: "Supabase não conectado ou token indisponível. Conecte em Configurações → Conectores.",
      durationMs: Date.now() - started,
    };
  }

  const creds = await getSupabaseCredentials(userId);
  if (!creds || !creds.accessToken) {
    return {
      ok: false,
      tool: "supabase",
      input,
      error: "Falha ao obter credenciais do conector Supabase.",
      durationMs: Date.now() - started,
    };
  }

  if (parsed.action === "projects_list") {
    const res = await supabaseListProjects(creds);
    if (!res.ok) {
      return { ok: false, tool: "supabase", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "supabase", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "tables_list") {
    if (!parsed.projectRef) {
      return {
        ok: false,
        tool: "supabase",
        input,
        error: "tables_list exige 'projectRef' (ou project_ref)",
        durationMs: Date.now() - started,
      };
    }
    const res = await supabaseListTables(creds, parsed.projectRef);
    if (!res.ok) {
      return { ok: false, tool: "supabase", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "supabase", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "table_read") {
    if (!parsed.projectRef) {
      return {
        ok: false,
        tool: "supabase",
        input,
        error: "table_read exige 'projectRef' (ou project_ref)",
        durationMs: Date.now() - started,
      };
    }
    if (!parsed.table) {
      return {
        ok: false,
        tool: "supabase",
        input,
        error: "table_read exige 'table'",
        durationMs: Date.now() - started,
      };
    }
    const res = await supabaseTableRead(creds, {
      projectRef: parsed.projectRef,
      table: parsed.table,
      limit: parsed.limit,
      select: parsed.select,
      where: parsed.where,
    });
    if (!res.ok) {
      return { ok: false, tool: "supabase", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "supabase", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "sql_exec") {
    if (!parsed.projectRef) {
      return {
        ok: false,
        tool: "supabase",
        input,
        error: "sql_exec exige 'projectRef' (ou project_ref)",
        durationMs: Date.now() - started,
      };
    }
    if (!parsed.query) {
      return {
        ok: false,
        tool: "supabase",
        input,
        error: "sql_exec exige 'query'",
        durationMs: Date.now() - started,
      };
    }

    // Defense in depth: blocklist antes de qualquer gate/execução.
    if (isQueryBlocklisted(parsed.query)) {
      return {
        ok: false,
        tool: "supabase",
        input,
        error:
          "Operação recusada: comandos DROP, TRUNCATE ou ALTER em DATABASE/SCHEMA são proibidos pela política de segurança do Supabase.",
        durationMs: Date.now() - started,
      };
    }

    const guard = await guardWrite({
      userId,
      provider: "supabase",
      capability: "sql_exec",
      target: `project:${parsed.projectRef}`,
      summary: `Executar SQL no projeto Supabase "${parsed.projectRef}"`,
      payload: buildWritePayload(parsed),
      contentPreview: parsed.query.slice(0, 200),
      missionId: parsed.missionId ?? null,
      executionId: executionId ?? null,
      gateId: parsed._gateId,
    });

    if (guard.kind === "refused") {
      return { ok: false, tool: "supabase", input, error: guard.error, durationMs: Date.now() - started };
    }
    if (guard.kind === "gate_pending") {
      return { ok: true, tool: "supabase", input, output: guard.output, durationMs: Date.now() - started };
    }

    const finalize: GateFinalize = guard.finalize;
    const res = await supabaseSqlExec(creds, parsed.projectRef, parsed.query);
    await finalize({
      ok: res.ok,
      output: res.ok ? res.output : null,
      error: res.ok ? null : res.error,
    });

    if (!res.ok) {
      return { ok: false, tool: "supabase", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "supabase", input, output: res.output, durationMs: Date.now() - started };
  }

  return {
    ok: false,
    tool: "supabase",
    input,
    error: "Ação do Supabase não suportada.",
    durationMs: Date.now() - started,
  };
}
