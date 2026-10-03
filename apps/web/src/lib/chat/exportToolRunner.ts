import { getDb } from "@/lib/db";
import { missions } from "@plutao/db";
import { eq, and } from "drizzle-orm";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import { runExportTool, type ExportResult } from "@/lib/runtime/tools/export";

export type ExportToolTrace = {
  id: string;
  provider: "files";
  capability: "files.export_pdf" | "files.export_xlsx" | "files.export_markdown" | "files.export_html";
  input: Record<string, unknown>;
  output: string;
  status: "ok" | "error";
  durationMs: number;
  timestamp: string;
};

export type ExportToolExecutionResult = {
  executed: boolean;
  capability?: "files.export_pdf" | "files.export_xlsx" | "files.export_markdown" | "files.export_html";
  trace?: ExportToolTrace;
  contextText?: string;
};

export function detectExportIntent(text: string): {
  capability: "files.export_pdf" | "files.export_xlsx" | "files.export_markdown" | "files.export_html";
  payload: Record<string, unknown>;
} | null {
  const t = text.toLowerCase();

  // PDF intents
  const isPdf =
    t.includes("gerar pdf") ||
    t.includes("exportar pdf") ||
    t.includes("exporte isso em pdf") ||
    t.includes("exportar em pdf") ||
    t.includes("exportar para pdf") ||
    t.includes("criar pdf") ||
    t.includes("salvar em pdf") ||
    t.includes("salvar pdf");

  if (isPdf) {
    const filenameMatch = text.match(/filename[:=]\s*["']?([a-zA-Z0-9_.-]+)["']?/i) ||
      text.match(/(?:nome|arquivo)\s+([a-zA-Z0-9_.-]+(?:\.pdf)?)/i);
    const titleMatch = text.match(/título[:=]\s*["']?([^"'\n]+)["']?/i);

    return {
      capability: "files.export_pdf",
      payload: {
        filename: filenameMatch ? filenameMatch[1] : "documento.pdf",
        title: titleMatch ? titleMatch[1].trim() : "Relatório Plutão OS",
        content: text,
      },
    };
  }

  // XLSX / Excel intents
  const isXlsx =
    t.includes("exportar planilha") ||
    t.includes("gerar planilha") ||
    t.includes("exportar excel") ||
    t.includes("exportar xlsx") ||
    t.includes("criar planilha") ||
    t.includes("salvar em planilha");

  if (isXlsx) {
    const filenameMatch = text.match(/filename[:=]\s*["']?([a-zA-Z0-9_.-]+)["']?/i) ||
      text.match(/(?:nome|arquivo)\s+([a-zA-Z0-9_.-]+(?:\.xlsx)?)/i);

    return {
      capability: "files.export_xlsx",
      payload: {
        filename: filenameMatch ? filenameMatch[1] : "planilha.xlsx",
        sheets: [
          {
            name: "Exportação",
            rows: [
              ["Data/Hora", new Date().toLocaleString("pt-BR")],
              ["Origem", "Chat Plutão OS"],
              ["Conteúdo Solicitado", text],
            ],
          },
        ],
      },
    };
  }

  // Markdown intents
  const isMd =
    t.includes("criar markdown") ||
    t.includes("gerar markdown") ||
    t.includes("exportar markdown") ||
    t.includes("salvar em markdown") ||
    t.includes("criar md");

  if (isMd) {
    const filenameMatch = text.match(/filename[:=]\s*["']?([a-zA-Z0-9_.-]+)["']?/i) ||
      text.match(/(?:nome|arquivo)\s+([a-zA-Z0-9_.-]+(?:\.md)?)/i);

    return {
      capability: "files.export_markdown",
      payload: {
        filename: filenameMatch ? filenameMatch[1] : "nota.md",
        title: "Documento Markdown",
        content: text,
        origin: "chat",
      },
    };
  }

  // HTML intents
  const isHtml =
    t.includes("criar html") ||
    t.includes("gerar html") ||
    t.includes("exportar html") ||
    t.includes("salvar em html");

  if (isHtml) {
    const filenameMatch = text.match(/filename[:=]\s*["']?([a-zA-Z0-9_.-]+)["']?/i) ||
      text.match(/(?:nome|arquivo)\s+([a-zA-Z0-9_.-]+(?:\.html)?)/i);

    return {
      capability: "files.export_html",
      payload: {
        filename: filenameMatch ? filenameMatch[1] : "pagina.html",
        title: "Página Exportada",
        content: `<p>${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
      },
    };
  }

  return null;
}

export async function detectAndExecuteExportTool(opts: {
  text: string;
  userId: string;
  executionId?: string;
  missionId?: string | null;
}): Promise<ExportToolExecutionResult> {
  const intent = detectExportIntent(opts.text);
  if (!intent) {
    return { executed: false };
  }

  const { capability, payload } = intent;
  const startedAt = new Date();
  const inputJson = JSON.stringify(payload);

  const res = await runExportTool(capability, inputJson, opts.executionId || "chat");
  const durationMs = Date.now() - startedAt.getTime();
  const timestamp = startedAt.toISOString();

  const trace: ExportToolTrace = {
    id: crypto.randomUUID(),
    provider: "files",
    capability,
    input: payload,
    output: res.ok ? res.output : (res.error ?? "Erro ao exportar arquivo"),
    status: res.ok ? "ok" : "error",
    durationMs,
    timestamp,
  };

  if (opts.missionId) {
    try {
      const db = getDb();
      const rows = await db
        .select({ evidence: missions.evidence })
        .from(missions)
        .where(and(eq(missions.id, opts.missionId), eq(missions.userId, opts.userId)))
        .limit(1);

      if (rows[0]) {
        const prevEv = parseEvidence(rows[0].evidence);
        const evidenceItem: EvidenceItem = {
          id: trace.id,
          type: res.ok ? "tool_result" : "tool_error",
          content: `tool:${capability} → ${trace.output}`,
          source: "tool_dispatcher",
          taskId: null,
          missionId: opts.missionId,
          createdAt: timestamp,
        };

        await db
          .update(missions)
          .set({ evidence: [...prevEv, evidenceItem], updatedAt: new Date() })
          .where(and(eq(missions.id, opts.missionId), eq(missions.userId, opts.userId)));
      }
    } catch {
      /* ignore evidence errors */
    }
  }

  let contextText = "";
  if (res.ok) {
    const exportResult = JSON.parse(res.output) as ExportResult;
    contextText = `[EXPORTAÇÃO DE ARQUIVO CONCLUÍDA]
Ferramenta executada: ${capability}
Status: Sucesso (${durationMs}ms)
Caminho salvo no filesystem: ${exportResult.path}
Tamanho do arquivo: ${exportResult.sizeBytes} bytes
Formato: ${exportResult.format}`;
  } else {
    contextText = `[FALHA NA EXPORTAÇÃO DE ARQUIVO]
Ferramenta executada: ${capability}
Status: Erro (${durationMs}ms)
Erro: ${res.error}`;
  }

  return {
    executed: true,
    capability,
    trace,
    contextText,
  };
}
