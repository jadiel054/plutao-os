import { PDFDocument, rgb, StandardFonts, PDFFont } from "pdf-lib";
import ExcelJS from "exceljs";
import { storageWrite } from "./storage";
import type { ToolName, ToolResult } from "./types";

export const MAX_EXPORT_SIZE = 5 * 1024 * 1024; // 5MB limit

export type ExportPdfInput = {
  filename?: string;
  title?: string;
  content?: string;
};

export type ExportXlsxSheet = {
  name?: string;
  rows?: any[][];
};

export type ExportXlsxInput = {
  filename?: string;
  sheets?: ExportXlsxSheet[];
};

export type ExportMarkdownInput = {
  filename?: string;
  content?: string;
  title?: string;
  origin?: string;
};

export type ExportHtmlInput = {
  filename?: string;
  title?: string;
  content?: string;
};

export type ExportResult = {
  path: string;
  sizeBytes: number;
  format: "pdf" | "xlsx" | "markdown" | "html";
};

/**
 * Sanitizes filename to prevent path traversal and ensures required extension.
 */
export function sanitizeFilename(filename: unknown, defaultExt: string): string {
  const raw = typeof filename === "string" ? filename.trim() : "";
  if (!raw) {
    return `export_${Date.now()}${defaultExt}`;
  }

  // Remove directory separators, traversal tokens, and control chars
  let clean = raw.replace(/[\/\\]/g, "").replace(/\.\./g, "").trim();
  clean = clean.replace(/[\x00-\x1f\x80-\x9f]/g, "");

  if (!clean) {
    clean = `export_${Date.now()}`;
  }

  if (!clean.toLowerCase().endsWith(defaultExt)) {
    clean = `${clean}${defaultExt}`;
  }

  return clean;
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : [""];
}

/**
 * files.export_pdf
 * Generates PDF via pdf-lib with title, date, body text, pagination, and footer.
 */
export async function exportPdf(
  input: ExportPdfInput,
  executionId: string = "default"
): Promise<ExportResult> {
  const sanitized = sanitizeFilename(input.filename || "documento.pdf", ".pdf");
  const targetPath = `exports/${sanitized}`;
  const titleText = input.title || "Relatório Plutão OS";
  const contentText = input.content || "";

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4 width
  const pageHeight = 841.89; // A4 height
  const margin = 50;
  const usableWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  // Title
  const titleSize = 18;
  const titleLines = wrapText(titleText, boldFont, titleSize, usableWidth);
  for (const tl of titleLines) {
    if (y - titleSize < margin + 40) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    page.drawText(tl, {
      x: margin,
      y: y - titleSize,
      size: titleSize,
      font: boldFont,
      color: rgb(0.05, 0.05, 0.08),
    });
    y -= titleSize + 6;
  }

  // Date / Header info
  const dateStr = `Data/Hora: ${new Date().toLocaleString("pt-BR")}`;
  page.drawText(dateStr, {
    x: margin,
    y: y - 10,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.45),
  });
  y -= 20;

  // Horizontal divider line
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.88),
  });
  y -= 25;

  // Body content
  const bodyFontSize = 10;
  const lineHeight = 14;
  const rawParagraphs = contentText.split("\n");

  for (const para of rawParagraphs) {
    const lines = wrapText(para, font, bodyFontSize, usableWidth);
    for (const l of lines) {
      if (y - lineHeight < margin + 40) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      if (l.trim().length > 0) {
        page.drawText(l, {
          x: margin,
          y: y - bodyFontSize,
          size: bodyFontSize,
          font,
          color: rgb(0.15, 0.15, 0.18),
        });
      }
      y -= lineHeight;
    }
  }

  // Draw Footer on all pages
  const totalPages = pdfDoc.getPageCount();
  const pages = pdfDoc.getPages();
  for (let i = 0; i < totalPages; i++) {
    const p = pages[i];
    const footerText = "Gerado pelo Plutão OS";
    p.drawText(footerText, {
      x: margin,
      y: 30,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.55),
    });

    const pageNumText = `Página ${i + 1} de ${totalPages}`;
    const pageNumWidth = font.widthOfTextAtSize(pageNumText, 9);
    p.drawText(pageNumText, {
      x: pageWidth - margin - pageNumWidth,
      y: 30,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.55),
    });
  }

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  if (pdfBuffer.length > MAX_EXPORT_SIZE) {
    throw new Error(`Limite de 5MB excedido (${pdfBuffer.length} bytes)`);
  }

  const written = await storageWrite(executionId, {
    path: targetPath,
    content: pdfBuffer,
  });

  return {
    path: targetPath,
    sizeBytes: written.size,
    format: "pdf",
  };
}

/**
 * files.export_xlsx
 * Generates XLSX spreadsheet via exceljs.
 */
export async function exportXlsx(
  input: ExportXlsxInput,
  executionId: string = "default"
): Promise<ExportResult> {
  const sanitized = sanitizeFilename(input.filename || "planilha.xlsx", ".xlsx");
  const targetPath = `exports/${sanitized}`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Plutão OS";
  workbook.created = new Date();

  const sheetsList =
    Array.isArray(input.sheets) && input.sheets.length > 0
      ? input.sheets
      : [{ name: "Planilha 1", rows: [] }];

  for (const sheetDef of sheetsList) {
    const sheetName = (sheetDef.name || "Planilha").replace(/[:\\/?*\[\]]/g, "").slice(0, 31) || "Sheet1";
    const ws = workbook.addWorksheet(sheetName);
    if (Array.isArray(sheetDef.rows)) {
      for (const row of sheetDef.rows) {
        if (Array.isArray(row)) {
          ws.addRow(row);
        }
      }
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const xlsxBuffer = Buffer.from(arrayBuffer);

  if (xlsxBuffer.length > MAX_EXPORT_SIZE) {
    throw new Error(`Limite de 5MB excedido (${xlsxBuffer.length} bytes)`);
  }

  const written = await storageWrite(executionId, {
    path: targetPath,
    content: xlsxBuffer,
  });

  return {
    path: targetPath,
    sizeBytes: written.size,
    format: "xlsx",
  };
}

/**
 * files.export_markdown
 * Saves Markdown document with frontmatter header.
 */
export async function exportMarkdown(
  input: ExportMarkdownInput,
  executionId: string = "default"
): Promise<ExportResult> {
  const sanitized = sanitizeFilename(input.filename || "nota.md", ".md");
  const targetPath = `exports/${sanitized}`;

  const titleStr = input.title || sanitized.replace(/\.md$/i, "");
  const originStr = input.origin || "chat";
  const dateStr = new Date().toISOString();
  const bodyText = input.content || "";

  const mdContent = `---
title: "${titleStr.replace(/"/g, '\\"')}"
date: "${dateStr}"
origin: "${originStr}"
---

${bodyText}`;

  const mdBuffer = Buffer.from(mdContent, "utf-8");

  if (mdBuffer.length > MAX_EXPORT_SIZE) {
    throw new Error(`Limite de 5MB excedido (${mdBuffer.length} bytes)`);
  }

  const written = await storageWrite(executionId, {
    path: targetPath,
    content: mdBuffer,
  });

  return {
    path: targetPath,
    sizeBytes: written.size,
    format: "markdown",
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * files.export_html
 * Generates standalone dark-themed HTML with embedded CSS.
 */
export async function exportHtml(
  input: ExportHtmlInput,
  executionId: string = "default"
): Promise<ExportResult> {
  const sanitized = sanitizeFilename(input.filename || "pagina.html", ".html");
  const targetPath = `exports/${sanitized}`;

  const titleStr = input.title || sanitized.replace(/\.html$/i, "");
  const dateStr = new Date().toLocaleString("pt-BR");
  const bodyContent = input.content || "";

  const htmlDocument = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(titleStr)}</title>
  <style>
    :root {
      --bg: #09090b;
      --surface: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --accent: #3b82f6;
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 2rem;
    }
    h1, h2, h3, h4 { color: #ffffff; margin-top: 1.5em; }
    h1 { margin-top: 0; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
    code, pre { background: #18181b; border-radius: 4px; font-family: monospace; }
    pre { padding: 1rem; overflow-x: auto; border: 1px solid var(--border); }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { border: 1px solid var(--border); padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #18181b; }
    footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(titleStr)}</h1>
    <main>
      ${bodyContent}
    </main>
    <footer>
      <p>Gerado pelo Plutão OS em ${dateStr}</p>
    </footer>
  </div>
</body>
</html>`;

  const htmlBuffer = Buffer.from(htmlDocument, "utf-8");

  if (htmlBuffer.length > MAX_EXPORT_SIZE) {
    throw new Error(`Limite de 5MB excedido (${htmlBuffer.length} bytes)`);
  }

  const written = await storageWrite(executionId, {
    path: targetPath,
    content: htmlBuffer,
  });

  return {
    path: targetPath,
    sizeBytes: written.size,
    format: "html",
  };
}

/**
 * Single runner entrypoint for runtime export tools.
 */
export async function runExportTool(
  name: string,
  input: string,
  executionId: string = "default"
): Promise<ToolResult> {
  const start = Date.now();
  let parsedInput: Record<string, unknown> = {};

  try {
    if (input) {
      parsedInput = JSON.parse(input) as Record<string, unknown>;
    }
  } catch {
    return {
      ok: false,
      tool: name,
      input,
      error: "INVALID_JSON_INPUT",
      durationMs: Date.now() - start,
    };
  }

  try {
    let result: ExportResult;
    switch (name) {
      case "files.export_pdf":
        result = await exportPdf(parsedInput as ExportPdfInput, executionId);
        break;
      case "files.export_xlsx":
        result = await exportXlsx(parsedInput as ExportXlsxInput, executionId);
        break;
      case "files.export_markdown":
        result = await exportMarkdown(parsedInput as ExportMarkdownInput, executionId);
        break;
      case "files.export_html":
        result = await exportHtml(parsedInput as ExportHtmlInput, executionId);
        break;
      default:
        return {
          ok: false,
          tool: name,
          input,
          error: `UNKNOWN_EXPORT_TOOL: ${name}`,
          durationMs: Date.now() - start,
        };
    }

    return {
      ok: true,
      tool: name as ToolName,
      input,
      output: JSON.stringify(result),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      tool: name,
      input,
      error: errorMsg,
      durationMs: Date.now() - start,
    };
  }
}
