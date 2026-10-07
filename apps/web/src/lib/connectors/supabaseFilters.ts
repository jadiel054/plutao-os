/**
 * H4 — Filtros estruturados para leitura de tabela no Supabase.
 *
 * Antes: `where` era uma string livre (`id=eq.1&nome=ilike.*x*`) repassada
 * diretamente para a query string do PostgREST. O chamador podia redefinir
 * parâmetros reservados (`select`, `limit`, `order`) e montar lógica arbitrária
 * com `and`/`or`, contornando a intenção validada.
 *
 * Agora: formato estrito `coluna=operador.valor` (múltiplos separados por `&`),
 * com allowlist de operadores, colunas validadas, parâmetros reservados
 * proibidos e limites de quantidade/tamanho. Valores nunca são interpolados em
 * SQL — seguem como parâmetros de URL codificados.
 */

export type TableFilter = {
  column: string;
  operator: string;
  value: string;
};

export type FilterParseResult =
  | { ok: true; filters: TableFilter[] }
  | { ok: false; error: string };

/** Operadores PostgREST permitidos. */
const ALLOWED_OPERATORS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "cs",
  "cd",
]);

/** Parâmetros reservados: não podem vir do chamador. */
const RESERVED_COLUMNS = new Set([
  "select",
  "limit",
  "offset",
  "order",
  "and",
  "or",
  "not",
  "on_conflict",
  "columns",
  "apikey",
]);

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_FILTERS = 10;
const MAX_VALUE_LEN = 200;

export function validateTableName(table: string): { ok: true } | { ok: false; error: string } {
  if (!IDENT_RE.test(table.trim())) {
    return {
      ok: false,
      error: `Nome de tabela inválido: '${table}'. Use apenas letras, números e underscore.`,
    };
  }
  return { ok: true };
}

export function validateSelect(select: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = (select || "*").trim();
  if (value === "*") return { ok: true, value };
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*$/.test(value)) {
    return {
      ok: false,
      error:
        "Parâmetro 'select' inválido: use '*' ou uma lista de colunas separadas por vírgula.",
    };
  }
  return { ok: true, value };
}

/**
 * Converte `where` em filtros validados.
 * Aceita `coluna=operador.valor` separados por `&`. `where` vazio/ausente → sem filtros.
 */
export function parseTableFilters(where?: string | null): FilterParseResult {
  const raw = (where ?? "").trim();
  if (!raw) return { ok: true, filters: [] };

  const parts = raw.split("&").map((p) => p.trim()).filter(Boolean);
  if (parts.length > MAX_FILTERS) {
    return { ok: false, error: `Máximo de ${MAX_FILTERS} filtros por consulta.` };
  }

  const filters: TableFilter[] = [];
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx <= 0) {
      return {
        ok: false,
        error: `Filtro inválido: '${part}'. Formato esperado: coluna=operador.valor (ex.: id=eq.1).`,
      };
    }

    const column = part.slice(0, eqIdx).trim();
    const rest = part.slice(eqIdx + 1).trim();

    if (RESERVED_COLUMNS.has(column.toLowerCase())) {
      return {
        ok: false,
        error: `Filtro recusado: '${column}' é parâmetro reservado e não pode ser definido pelo chamador.`,
      };
    }
    if (!IDENT_RE.test(column)) {
      return {
        ok: false,
        error: `Coluna inválida no filtro: '${column}'.`,
      };
    }

    const dotIdx = rest.indexOf(".");
    if (dotIdx <= 0) {
      return {
        ok: false,
        error: `Filtro inválido em '${column}': use operador.valor (ex.: ${column}=eq.1).`,
      };
    }

    const operator = rest.slice(0, dotIdx).trim().toLowerCase();
    const value = rest.slice(dotIdx + 1).trim();

    if (!ALLOWED_OPERATORS.has(operator)) {
      return {
        ok: false,
        error: `Operador '${operator}' não permitido. Use: ${[...ALLOWED_OPERATORS].join(", ")}.`,
      };
    }
    if (value.length === 0) {
      return { ok: false, error: `Filtro '${column}=${operator}.' sem valor.` };
    }
    if (value.length > MAX_VALUE_LEN) {
      return {
        ok: false,
        error: `Valor do filtro '${column}' excede ${MAX_VALUE_LEN} caracteres.`,
      };
    }
    if (operator === "is" && !/^(null|true|false|unknown)$/i.test(value)) {
      return {
        ok: false,
        error: `Operador 'is' aceita apenas null, true, false ou unknown (recebido: '${value}').`,
      };
    }
    if (operator === "in") {
      const inner = value.replace(/^\(/, "").replace(/\)$/, "");
      const items = inner.split(",").map((i) => i.trim()).filter(Boolean);
      if (items.length === 0 || items.length > 25) {
        return { ok: false, error: "Operador 'in' aceita entre 1 e 25 valores." };
      }
      if (!items.every((i) => /^[A-Za-z0-9_\-.:@ ]+$/.test(i))) {
        return { ok: false, error: "Operador 'in' contém valor não permitido." };
      }
    }

    filters.push({ column, operator, value });
  }

  return { ok: true, filters };
}
