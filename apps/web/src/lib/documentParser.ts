import * as XLSX from "xlsx";

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
 * Converte planilhas Excel (.xlsx, .xls) em tabelas Markdown estruturadas para o LLM.
 */
export function extractTextFromExcel(buffer: Buffer): string {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetParts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean>>(sheet, {
        header: 1,
        blankrows: false,
      });

      if (!rows || rows.length === 0) continue;

      const formattedRows: string[] = [];
      formattedRows.push(`### Planilha: ${sheetName}`);

      const headerRow = rows[0] || [];
      if (headerRow.length > 0) {
        const headerCols = headerRow.map((cell) => String(cell ?? "").trim().replace(/\|/g, "\\|"));
        formattedRows.push(`| ${headerCols.join(" | ")} |`);
        formattedRows.push(`| ${headerCols.map(() => "---").join(" | ")} |`);

        for (let i = 1; i < rows.length; i++) {
          const rowData = rows[i] || [];
          if (rowData.length === 0 && i > 50) break; // cap huge empty spaces
          const cols = headerCols.map((_, colIdx) => {
            const cellVal = rowData[colIdx];
            return String(cellVal ?? "").trim().replace(/\|/g, "\\|");
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
