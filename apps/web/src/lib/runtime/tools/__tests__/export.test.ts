import { describe, it, expect, beforeEach } from "vitest";
import {
  exportPdf,
  exportXlsx,
  exportMarkdown,
  exportHtml,
  sanitizeFilename,
  runExportTool,
  MAX_EXPORT_SIZE,
} from "../export";
import { storageRead, resetStorage } from "../storage";
import { detectAndExecuteExportTool, detectExportIntent } from "@/lib/chat/exportToolRunner";

describe("Export Tools Package", () => {
  const EXEC_ID = "test-export-exec";

  beforeEach(() => {
    resetStorage();
  });

  describe("Filename Sanitization", () => {
    it("should clean path traversal characters", () => {
      expect(sanitizeFilename("../../secret.pdf", ".pdf")).toBe("secret.pdf");
      expect(sanitizeFilename("/etc/passwd", ".pdf")).toBe("etcpasswd.pdf");
      expect(sanitizeFilename("folder\\nested\\doc", ".pdf")).toBe("foldernesteddoc.pdf");
    });

    it("should append default extension if missing", () => {
      expect(sanitizeFilename("relatorio", ".pdf")).toBe("relatorio.pdf");
      expect(sanitizeFilename("vendas.v1", ".xlsx")).toBe("vendas.v1.xlsx");
    });

    it("should handle empty or invalid filenames", () => {
      const result = sanitizeFilename("", ".md");
      expect(result).toMatch(/^export_\d+\.md$/);
    });
  });

  describe("files.export_pdf", () => {
    it("should generate a valid PDF with correct magic bytes %PDF", async () => {
      const res = await exportPdf(
        {
          filename: "relatorio_mensal.pdf",
          title: "Relatório Mensal Plutão OS",
          content: "Primeiro parágrafo do relatório.\nSegundo parágrafo com detalhes adicionais.",
        },
        EXEC_ID
      );

      expect(res.path).toBe("exports/relatorio_mensal.pdf");
      expect(res.format).toBe("pdf");
      expect(res.sizeBytes).toBeGreaterThan(0);

      const fileData = await storageRead(EXEC_ID, { path: "exports/relatorio_mensal.pdf" });
      expect(fileData).not.toBeNull();

      const buffer = Buffer.isBuffer(fileData!.content)
        ? fileData!.content
        : Buffer.from(fileData!.content);

      // Check %PDF magic bytes (0x25 0x50 0x44 0x46)
      expect(buffer.slice(0, 4).toString("ascii")).toBe("%PDF");
    });
  });

  describe("files.export_xlsx", () => {
    it("should generate a valid XLSX spreadsheet with magic bytes PK", async () => {
      const res = await exportXlsx(
        {
          filename: "vendas_2026.xlsx",
          sheets: [
            {
              name: "Vendas Q1",
              rows: [
                ["Mês", "Receita"],
                ["Janeiro", 15000],
                ["Fevereiro", 18500],
              ],
            },
          ],
        },
        EXEC_ID
      );

      expect(res.path).toBe("exports/vendas_2026.xlsx");
      expect(res.format).toBe("xlsx");
      expect(res.sizeBytes).toBeGreaterThan(0);

      const fileData = await storageRead(EXEC_ID, { path: "exports/vendas_2026.xlsx" });
      expect(fileData).not.toBeNull();

      const buffer = Buffer.isBuffer(fileData!.content)
        ? fileData!.content
        : Buffer.from(fileData!.content);

      // Check PK zip magic bytes (0x50 0x4B)
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4b);
    });
  });

  describe("files.export_markdown", () => {
    it("should generate a markdown file with YAML frontmatter", async () => {
      const res = await exportMarkdown(
        {
          filename: "notas.md",
          title: "Notas de Reunião",
          content: "# Pauta\n- Item 1\n- Item 2",
          origin: "missao_123",
        },
        EXEC_ID
      );

      expect(res.path).toBe("exports/notas.md");
      expect(res.format).toBe("markdown");

      const fileData = await storageRead(EXEC_ID, { path: "exports/notas.md" });
      expect(fileData).not.toBeNull();

      const text = typeof fileData!.content === "string"
        ? fileData!.content
        : fileData!.content.toString("utf-8");

      expect(text).toContain("---");
      expect(text).toContain('title: "Notas de Reunião"');
      expect(text).toContain('origin: "missao_123"');
      expect(text).toContain("# Pauta");
    });
  });

  describe("files.export_html", () => {
    it("should generate a standalone dark-themed HTML document", async () => {
      const res = await exportHtml(
        {
          filename: "pagina.html",
          title: "Dashboard de Operações",
          content: "<h2>Métricas</h2><p>Tudo operacional.</p>",
        },
        EXEC_ID
      );

      expect(res.path).toBe("exports/pagina.html");
      expect(res.format).toBe("html");

      const fileData = await storageRead(EXEC_ID, { path: "exports/pagina.html" });
      expect(fileData).not.toBeNull();

      const text = typeof fileData!.content === "string"
        ? fileData!.content
        : fileData!.content.toString("utf-8");

      expect(text).toContain("<!DOCTYPE html>");
      expect(text).toContain("<title>Dashboard de Operações</title>");
      expect(text).toContain("--bg: #09090b;");
      expect(text).toContain("Gerado pelo Plutão OS");
    });
  });

  describe("5MB Size Limit Enforcement", () => {
    it("should reject export exceeding 5MB limit", async () => {
      const hugeString = "X".repeat(MAX_EXPORT_SIZE + 1024);
      await expect(
        exportMarkdown({ filename: "huge.md", content: hugeString }, EXEC_ID)
      ).rejects.toThrow(/Limite de 5MB excedido/);
    });
  });

  describe("Dispatcher & Chat Intent Runner Integration", () => {
    const USER_ID = "11111111-1111-4111-8111-111111111111";

    it("should execute via runExportTool runner", async () => {
      const input = JSON.stringify({ filename: "doc.pdf", title: "Teste", content: "OK" });
      const toolRes = await runExportTool("files.export_pdf", input, EXEC_ID, USER_ID);

      expect(toolRes.ok).toBe(true);
      expect(toolRes.tool).toBe("files.export_pdf");

      if (toolRes.ok) {
        const outputObj = JSON.parse(toolRes.output);
        expect(outputObj.path).toBe("exports/doc.pdf");
        expect(outputObj.format).toBe("pdf");
      }
    });

    it("should detect PT-BR export intents correctly", () => {
      expect(detectExportIntent("por favor gerar pdf do relatório")?.capability).toBe("files.export_pdf");
      expect(detectExportIntent("exportar planilha com vendas")?.capability).toBe("files.export_xlsx");
      expect(detectExportIntent("criar markdown das notas")?.capability).toBe("files.export_markdown");
      expect(detectExportIntent("gerar html da documentação")?.capability).toBe("files.export_html");
      expect(detectExportIntent("olá tudo bem?")).toBeNull();
    });

    it("should execute detectAndExecuteExportTool in chat context", async () => {
      const chatRes = await detectAndExecuteExportTool({
        text: "exporte isso em PDF com título Relatório Final",
        userId: "11111111-1111-4111-8111-111111111111",
        executionId: EXEC_ID,
      });

      expect(chatRes.executed).toBe(true);
      expect(chatRes.capability).toBe("files.export_pdf");
      expect(chatRes.contextText).toContain("[EXPORTAÇÃO DE ARQUIVO CONCLUÍDA]");
      expect(chatRes.contextText).toContain("exports/documento.pdf");
    });
  });
});
