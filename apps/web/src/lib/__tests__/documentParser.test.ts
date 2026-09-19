import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { extractTextFromExcel } from "../documentParser";

describe("documentParser", () => {
  it("extrai tabelas Markdown de planilhas Excel em buffer", () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ["Nome", "Cargo", "Salario"],
      ["Ana", "Engenheira", 12000],
      ["Bruno", "Designer", 9000],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Funcionarios");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const extracted = extractTextFromExcel(buffer);

    expect(extracted).toContain("### Planilha: Funcionarios");
    expect(extracted).toContain("| Nome | Cargo | Salario |");
    expect(extracted).toContain("| Ana | Engenheira | 12000 |");
    expect(extracted).toContain("| Bruno | Designer | 9000 |");
  });
});
