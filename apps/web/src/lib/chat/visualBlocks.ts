/**
 * Blocos visuais do chat — parsing puro e testavel.
 *
 * O agente pode entregar dados estruturados em blocos cercados:
 *   ```chart  {"type":"bar","title":"...","unit":"R$","data":[{"label":"Jan","value":120}]}
 *   ```table  [["col1","col2"],["a","b"]] | [{"col1":"a"}] | CSV textual
 *
 * Regras de integridade: dados invalidos NUNCA viram grafico — retornam como
 * texto/codigo. Nada e inventado; o componente so renderiza o que o backend
 * (ou o agente) entregou.
 */

export type ChartType = "bar" | "line" | "pie" | "donut" | "metric";

export type ChartPoint = { label: string; value: number };

export type ChartSpec = {
  kind: "chart";
  chartType: ChartType;
  title?: string;
  unit?: string;
  data: ChartPoint[];
};

export type TableSpec = {
  kind: "table";
  title?: string;
  columns: string[];
  rows: string[][];
};

export type VisualSpec = ChartSpec | TableSpec;

export type ContentPart =
  | { kind: "text"; text: string }
  | { kind: "code"; language: string; text: string }
  | { kind: "visual"; spec: VisualSpec };

const MAX_CHART_POINTS = 12;
const MAX_TABLE_ROWS = 500;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toLabel(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const candidate = rec.label ?? rec.name ?? rec.key ?? rec.title;
    if (typeof candidate === "string") return candidate.trim();
    if (typeof candidate === "number") return String(candidate);
  }
  return "";
}

/** Normaliza a carga de um bloco chart; null quando invalida. */
export function normalizeChartSpec(raw: unknown): ChartSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const rawType = typeof obj.type === "string" ? obj.type.toLowerCase() : "bar";
  const chartType: ChartType =
    rawType === "line" || rawType === "pie" || rawType === "donut" || rawType === "metric" || rawType === "kpi"
      ? (rawType === "kpi" ? "metric" : (rawType as ChartType))
      : "bar";

  let data: ChartPoint[] = [];
  if (Array.isArray(obj.data)) {
    for (const item of obj.data) {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        const label = toLabel(rec.label ?? rec.name ?? rec.key);
        const value = toNumber(rec.value ?? rec.y ?? rec.count);
        if (label && value !== null) data.push({ label, value });
      } else if (Array.isArray(item) && item.length >= 2) {
        const label = toLabel(item[0]);
        const value = toNumber(item[1]);
        if (label && value !== null) data.push({ label, value });
      }
    }
  } else if (Array.isArray(obj.labels) && Array.isArray(obj.values)) {
    const labels = obj.labels as unknown[];
    const values = obj.values as unknown[];
    const len = Math.min(labels.length, values.length);
    for (let i = 0; i < len; i++) {
      const label = toLabel(labels[i]);
      const value = toNumber(values[i]);
      if (label && value !== null) data.push({ label, value });
    }
  }

  if (data.length === 0) return null;
  if (data.length > MAX_CHART_POINTS) data = data.slice(0, MAX_CHART_POINTS);

  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim().slice(0, 120) : undefined;
  const unit = typeof obj.unit === "string" && obj.unit.trim() ? obj.unit.trim().slice(0, 12) : undefined;

  return { kind: "chart", chartType, title, unit, data };
}

/** Divide uma linha CSV respeitando aspas simples/duplas. */
function splitCsvLine(line: string, separator: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote && line[i + 1] === quote) {
        current += quote;
        i++;
      } else if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === separator) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

function looksNumeric(values: string[]): boolean {
  return values.length > 0 && values.every((v) => toNumber(v) !== null);
}

/** Normaliza a carga de um bloco table; null quando invalida. */
export function normalizeTableSpec(raw: unknown, title?: string): TableSpec | null {
  // Formato 1: array de objetos
  if (Array.isArray(raw) && raw.length > 0 && raw.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
    const records = raw as Array<Record<string, unknown>>;
    const columns: string[] = [];
    for (const rec of records) {
      for (const key of Object.keys(rec)) {
        if (!columns.includes(key)) columns.push(key);
      }
    }
    if (columns.length === 0) return null;
    const rows = records
      .slice(0, MAX_TABLE_ROWS)
      .map((rec) => columns.map((c) => (rec[c] === undefined || rec[c] === null ? "" : String(rec[c]))));
    return { kind: "table", title, columns, rows };
  }

  // Formato 2: matriz [[...],[...]]
  if (Array.isArray(raw) && raw.length > 0 && raw.every((r) => Array.isArray(r))) {
    const matrix = raw as unknown[][];
    if (matrix.length < 2 || matrix[0].length === 0) return null;
    const columns = matrix[0].map((c) => String(c ?? "").trim() || "—");
    const rows = matrix
      .slice(1, MAX_TABLE_ROWS + 1)
      .map((row) => columns.map((_, i) => (row[i] === undefined || row[i] === null ? "" : String(row[i]))));
    return { kind: "table", title, columns, rows };
  }

  return null;
}

/** Interpreta o corpo textual de um bloco ```table (JSON ou CSV). */
export function parseTableBody(body: string, title?: string): TableSpec | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return normalizeTableSpec(list, title);
    } catch {
      /* cai no CSV */
    }
  }

  const separator = (trimmed.split("\n")[0].match(/;/g)?.length ?? 0) > (trimmed.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const header = splitCsvLine(lines[0], separator);
  if (header.length < 2) return null;
  const rows = lines
    .slice(1, MAX_TABLE_ROWS + 1)
    .map((l) => {
      const cells = splitCsvLine(l, separator);
      while (cells.length < header.length) cells.push("");
      return cells.slice(0, header.length);
    });
  return { kind: "table", title, columns: header, rows };
}

/** Colunas numericas (para alinhamento e possivel grafico a partir da tabela). */
export function numericColumns(spec: TableSpec): number[] {
  const idx: number[] = [];
  spec.columns.forEach((_, i) => {
    if (looksNumeric(spec.rows.map((r) => r[i] ?? ""))) idx.push(i);
  });
  return idx;
}

/** Converte a primeira coluna categorica + primeira numerica em ChartSpec (para "ver como grafico"). */
export function tableToChartSpec(spec: TableSpec): ChartSpec | null {
  const numeric = numericColumns(spec);
  if (numeric.length === 0) return null;
  const labelIdx = spec.columns.findIndex((_, i) => !numeric.includes(i));
  const data: ChartPoint[] = [];
  for (const row of spec.rows) {
    const label = labelIdx >= 0 ? (row[labelIdx] ?? "") : `Série ${data.length + 1}`;
    const value = toNumber(row[numeric[0]] ?? "");
    if (label && value !== null) data.push({ label, value });
  }
  if (data.length < 2) return null;
  return { kind: "chart", chartType: "bar", title: spec.title, data: data.slice(0, MAX_CHART_POINTS) };
}

/**
 * Divide o conteudo da resposta em partes: texto, codigo e blocos visuais
 * (chart/table). Blocos com dados invalidos permanecem como codigo — nunca
 * sao escondidos nem "consertados" com dados inventados.
 */
export function parseVisualBlocks(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;

  const pushText = (text: string) => {
    if (text.trim()) parts.push({ kind: "text", text });
  };

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    pushText(content.slice(lastIndex, match.index));
    const language = (match[1] || "").toLowerCase();
    const body = match[2];

    if (language === "chart") {
      try {
        const spec = normalizeChartSpec(JSON.parse(body));
        if (spec) {
          parts.push({ kind: "visual", spec });
          lastIndex = regex.lastIndex;
          continue;
        }
      } catch {
        /* JSON invalido: mantém como codigo */
      }
    }

    if (language === "table" || language === "datatable") {
      const spec = parseTableBody(body);
      if (spec) {
        parts.push({ kind: "visual", spec });
        lastIndex = regex.lastIndex;
        continue;
      }
    }

    if (language === "csv") {
      const spec = parseTableBody(body);
      if (spec && spec.rows.length > 0) {
        parts.push({ kind: "visual", spec });
        lastIndex = regex.lastIndex;
        continue;
      }
    }

    parts.push({ kind: "code", language: match[1] || "code", text: match[2] });
    lastIndex = regex.lastIndex;
  }

  pushText(content.slice(lastIndex));
  return parts;
}
