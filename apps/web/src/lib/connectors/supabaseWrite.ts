/**
 * Supabase client and execution engine for tools.
 * Handles Management API, PostgREST queries, 15s timeouts,
 * PT-BR error translations, blocklist verification, and limits.
 */

import { getConnectorRow, getAccessToken } from "@/lib/connectors/service";
import { decryptToken } from "@/lib/connectors/crypto";
import {
  parseTableFilters,
  validateSelect,
  validateTableName,
} from "./supabaseFilters";

export type SupabaseCredentials = {
  accessToken: string;
  projectUrl?: string | null;
  serviceRoleKey?: string | null;
};

export async function getSupabaseCredentials(
  userId: string
): Promise<SupabaseCredentials | null> {
  const row = await getConnectorRow(userId, "supabase");
  if (!row || row.status !== "connected") return null;

  const accessToken = await getAccessToken(userId, "supabase");
  if (!accessToken) return null;

  let projectUrl: string | null = null;
  let serviceRoleKey: string | null = null;

  if (row.refreshTokenEnc) {
    try {
      const jsonStr = decryptToken(row.refreshTokenEnc);
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      if (typeof parsed.projectUrl === "string" && parsed.projectUrl.trim()) {
        projectUrl = parsed.projectUrl.trim();
      }
      if (typeof parsed.serviceRoleKey === "string" && parsed.serviceRoleKey.trim()) {
        serviceRoleKey = parsed.serviceRoleKey.trim();
      }
    } catch {
      /* ignore invalid refresh token */
    }
  }

  return { accessToken, projectUrl, serviceRoleKey };
}

/** 15s Timeout wrapper for fetch calls */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Tempo limite atingido para requisição ao Supabase (15s).");
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

/** PT-BR error message formatter */
function translateError(status: number, message?: string): string {
  if (status === 401 || status === 403) {
    return "Acesso não autorizado ao Supabase. Verifique seu PAT ou Service Role Key.";
  }
  if (status === 404) {
    return "Recurso não encontrado no Supabase (ref do projeto ou tabela inexistente).";
  }
  if (status === 400) {
    return `Requisição inválida para o Supabase: ${message || "sintaxe incorreta"}`;
  }
  if (status >= 500) {
    return `Erro interno nos servidores do Supabase (HTTP ${status}). Tente novamente mais tarde.`;
  }
  return message || `Erro na API do Supabase (HTTP ${status}).`;
}

/** Check if SQL query hits safety blocklist: DROP/TRUNCATE/ALTER on DATABASE or SCHEMA */
export function isQueryBlocklisted(query: string): boolean {
  return /\b(DROP|TRUNCATE|ALTER)\s+(DATABASE|SCHEMA)\b/i.test(query);
}

/** List projects via Supabase Management API */
export async function supabaseListProjects(
  creds: SupabaseCredentials
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetchWithTimeout("https://api.supabase.com/v1/projects", {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        Accept: "application/json",
      },
    });

    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* fallback */
    }

    if (!res.ok) {
      const msg = typeof data === "object" && data && "message" in data ? String((data as Record<string, unknown>).message) : undefined;
      return { ok: false, error: translateError(res.status, msg) };
    }

    const list = Array.isArray(data) ? data : [];
    if (list.length === 0) {
      return { ok: true, output: "Nenhum projeto encontrado nesta conta Supabase.", rawData: data };
    }

    const lines = list.map((p, i) => {
      const row = p as Record<string, unknown>;
      const name = String(row.name ?? row.id ?? "?");
      const ref = String(row.ref ?? row.id ?? "?");
      const region = String(row.region ?? "—");
      const status = String(row.status ?? "ACTIVE");
      return `${i + 1}. **${name}** (ref: \`${ref}\`)\n   região: ${region} · status: ${status}`;
    });

    return {
      ok: true,
      output: `Projetos Supabase (${list.length}):\n\n${lines.join("\n\n")}`,
      rawData: data,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao listar projetos no Supabase.",
    };
  }
}

/** List public tables via PostgREST OpenAPI or Management API query fallback */
export async function supabaseListTables(
  creds: SupabaseCredentials,
  projectRef: string
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  if (!projectRef || !projectRef.trim()) {
    return { ok: false, error: "project_ref é obrigatório para listar tabelas." };
  }

  const cleanRef = projectRef.trim();

  // Try via Management API query endpoint first if available
  try {
    const query = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;";
    const queryRes = await fetchWithTimeout(`https://api.supabase.com/v1/projects/${encodeURIComponent(cleanRef)}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (queryRes.ok) {
      const data = (await queryRes.json().catch(() => null)) as unknown;
      if (Array.isArray(data)) {
        const tableNames = data.map((r: Record<string, unknown>) => String(r.table_name ?? r.tablename ?? ""));
        if (tableNames.length === 0) {
          return { ok: true, output: `Nenhuma tabela encontrada no schema public do projeto ${cleanRef}.`, rawData: data };
        }
        const lines = tableNames.map((t, i) => `${i + 1}. **${t}**`);
        return {
          ok: true,
          output: `Tabelas do schema public (${tableNames.length}):\n\n${lines.join("\n")}`,
          rawData: data,
        };
      }
    }
  } catch {
    /* fallback to PostgREST OpenAPI */
  }

  // Fallback: PostgREST root OpenAPI endpoint
  const baseUrl = creds.projectUrl
    ? creds.projectUrl.replace(/\/$/, "")
    : `https://${encodeURIComponent(cleanRef)}.supabase.co`;

  const headers: Record<string, string> = { Accept: "application/json" };
  const authKey = creds.serviceRoleKey || creds.accessToken;
  headers["apikey"] = authKey;
  headers["Authorization"] = `Bearer ${authKey}`;

  try {
    const res = await fetchWithTimeout(`${baseUrl}/rest/v1/`, { headers });
    if (!res.ok) {
      return { ok: false, error: translateError(res.status) };
    }

    const openApiData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const definitions = (openApiData.definitions ?? {}) as Record<string, unknown>;
    const tableNames = Object.keys(definitions).sort();

    if (tableNames.length === 0) {
      return { ok: true, output: `Nenhuma tabela encontrada no schema public do projeto ${cleanRef}.`, rawData: openApiData };
    }

    const lines = tableNames.map((t, i) => `${i + 1}. **${t}**`);
    return {
      ok: true,
      output: `Tabelas do schema public (${tableNames.length}):\n\n${lines.join("\n")}`,
      rawData: openApiData,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao listar tabelas do Supabase.",
    };
  }
}

/** Read table contents (SELECT only, max 100 rows) */
export async function supabaseTableRead(
  creds: SupabaseCredentials,
  opts: {
    projectRef: string;
    table: string;
    limit?: number;
    select?: string;
    where?: string;
  }
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  const { projectRef, table, where } = opts;
  if (!projectRef || !projectRef.trim()) {
    return { ok: false, error: "project_ref é obrigatório." };
  }
  if (!table || !table.trim()) {
    return { ok: false, error: "table é obrigatória." };
  }

  // H4 - validacao estrita de colunas em select.
  const selectCheck = validateSelect(opts.select || "*");
  if (!selectCheck.ok) {
    return { ok: false, error: selectCheck.error };
  }
  const select = selectCheck.value;

  // Cap limit at 100 max
  const rawLimit = typeof opts.limit === "number" ? opts.limit : 50;
  const limit = Math.min(100, Math.max(1, rawLimit));

  const cleanRef = projectRef.trim();
  const cleanTable = table.trim();

  // H4 - nome de tabela restrito a identificador.
  const tableCheck = validateTableName(cleanTable);
  if (!tableCheck.ok) {
    return { ok: false, error: tableCheck.error };
  }

  // Primary attempt via PostgREST endpoint
  const baseUrl = creds.projectUrl
    ? creds.projectUrl.replace(/\/$/, "")
    : `https://${encodeURIComponent(cleanRef)}.supabase.co`;

  const url = new URL(`${baseUrl}/rest/v1/${encodeURIComponent(cleanTable)}`);
  url.searchParams.set("select", select);
  url.searchParams.set("limit", String(limit));

  // H4 - filtros estruturados validados; parametros reservados sao recusados.
  const filterParse = parseTableFilters(where);
  if (!filterParse.ok) {
    return { ok: false, error: filterParse.error };
  }
  for (const f of filterParse.filters) {
    url.searchParams.set(f.column, `${f.operator}.${f.value}`);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const authKey = creds.serviceRoleKey || creds.accessToken;
  headers["apikey"] = authKey;
  headers["Authorization"] = `Bearer ${authKey}`;

  try {
    const res = await fetchWithTimeout(url.toString(), { headers });
    if (res.ok) {
      const data = (await res.json().catch(() => [])) as unknown;
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) {
        return { ok: true, output: `Nenhum registro encontrado na tabela \`${cleanTable}\`.`, rawData: data };
      }

      const snippet = JSON.stringify(rows, null, 2).slice(0, 3000);
      return {
        ok: true,
        output: `Leitura da tabela \`${cleanTable}\` (${rows.length} linhas, limite: ${limit}):\n\n\`\`\`json\n${snippet}\n\`\`\``,
        rawData: data,
      };
    }
  } catch {
    /* fallback to Management API SQL query */
  }

  // Fallback: Management API query
  try {
    const sqlWhere = where ? ` WHERE ${where}` : "";
    const query = `SELECT ${select} FROM public.${cleanTable}${sqlWhere} LIMIT ${limit};`;

    const res = await fetchWithTimeout(`https://api.supabase.com/v1/projects/${encodeURIComponent(cleanRef)}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* fallback */
    }

    if (!res.ok) {
      const msg = typeof data === "object" && data && "message" in data ? String((data as Record<string, unknown>).message) : undefined;
      return { ok: false, error: translateError(res.status, msg) };
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      return { ok: true, output: `Nenhum registro encontrado na tabela \`${cleanTable}\`.`, rawData: data };
    }

    const snippet = JSON.stringify(rows, null, 2).slice(0, 3000);
    return {
      ok: true,
      output: `Leitura da tabela \`${cleanTable}\` (${rows.length} linhas, limite: ${limit}):\n\n\`\`\`json\n${snippet}\n\`\`\``,
      rawData: data,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao ler dados da tabela no Supabase.",
    };
  }
}

/** Execute SQL query on Supabase (Max 10k chars, strict blocklist check) */
export async function supabaseSqlExec(
  creds: SupabaseCredentials,
  projectRef: string,
  query: string
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  if (!projectRef || !projectRef.trim()) {
    return { ok: false, error: "project_ref é obrigatório." };
  }
  if (!query || !query.trim()) {
    return { ok: false, error: "query SQL é obrigatória." };
  }

  const rawQuery = query.trim();

  // Check 10k chars limit
  if (rawQuery.length > 10000) {
    return {
      ok: false,
      error: "Query excede o limite máximo de 10.000 caracteres.",
    };
  }

  // Check blocklist defense
  if (isQueryBlocklisted(rawQuery)) {
    return {
      ok: false,
      error: "Operação recusada: comandos DROP, TRUNCATE ou ALTER em DATABASE/SCHEMA são proibidos pela política de segurança do Supabase.",
    };
  }

  const cleanRef = projectRef.trim();

  try {
    const res = await fetchWithTimeout(`https://api.supabase.com/v1/projects/${encodeURIComponent(cleanRef)}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: rawQuery }),
    });

    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* fallback */
    }

    if (!res.ok) {
      const msg = typeof data === "object" && data && "message" in data ? String((data as Record<string, unknown>).message) : undefined;
      return { ok: false, error: translateError(res.status, msg) };
    }

    const outputSnippet =
      typeof data === "object" ? JSON.stringify(data, null, 2).slice(0, 2500) : String(data);

    return {
      ok: true,
      output: `SQL executado com sucesso no projeto \`${cleanRef}\`:\n\n\`\`\`json\n${outputSnippet}\n\`\`\``,
      rawData: data,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao executar SQL no Supabase.",
    };
  }
}
