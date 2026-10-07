/**
 * Extrai texto legível de arquivos PDF em Buffer.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    if (typeof globalThis.DOMMatrix === "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).DOMMatrix = class DOMMatrix {};
    }
    const pdfParseModule = await import("pdf-parse");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfFn = (pdfParseModule as any).default || pdfParseModule;
    const pdfData = await pdfFn(buffer);
    return pdfData && pdfData.text ? pdfData.text.trim() : "";
  } catch (err) {
    console.error("[extractTextFromPdf error]", err);
    return "";
  }
}

/**
 * Converte planilhas Excel Open XML (.xlsx) em tabelas Markdown estruturadas para o LLM.
 */
export async function extractTextFromExcel(buffer: Buffer): Promise<string> {
  const MAX_PARSE_MS = 8_000;
  try {
    const excelJsModule = await import("exceljs");
    const ExcelJS = excelJsModule.default ?? excelJsModule;
    const workbook = new ExcelJS.Workbook();
    // ExcelJS e @types/node podem declarar Buffers com ArrayBuffer genérico
    // diferente; em runtime ambos recebem o mesmo Buffer Node.js.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Excel parse timeout")), MAX_PARSE_MS);
      });
      await Promise.race([
        workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]),
        timeout,
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    const sheetParts: string[] = [];

    for (const worksheet of workbook.worksheets) {
      const rows: unknown[][] = [];
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        if (rows.length < 1000) {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          rows.push(values);
        }
      });

      if (!rows || rows.length === 0) continue;

      const formattedRows: string[] = [];
      formattedRows.push(`### Planilha: ${worksheet.name}`);

      const headerRow = rows[0] || [];
      if (headerRow.length > 0) {
        const headerCols = headerRow.map((cell) => cellToText(cell));
        formattedRows.push(`| ${headerCols.join(" | ")} |`);
        formattedRows.push(`| ${headerCols.map(() => "---").join(" | ")} |`);

        for (let i = 1; i < rows.length; i++) {
          const rowData = rows[i] || [];
          if (rowData.length === 0 && i > 50) break;
          const cols = headerCols.map((_, colIdx) => {
            const cellVal = rowData[colIdx];
            return cellToText(cellVal);
          });
          formattedRows.push(`| ${cols.join(" | ")} |`);
        }
      }

      sheetParts.push(formattedRows.join("\n"));
    }

    return sheetParts.join("\n\n");
  } catch (err) {
    console.error("[extractTextFromExcel error]", err);
    return "";
  }
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim().replace(/\|/g, "\\|");
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : ""))
        .join("")
        .trim()
        .replace(/\|/g, "\\|");
    }
    if ("result" in value) return String(value.result ?? "").trim().replace(/\|/g, "\\|");
  }
  return String(value).trim().replace(/\|/g, "\\|");
}
