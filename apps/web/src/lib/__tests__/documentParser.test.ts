import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { extractTextFromExcel } from "../documentParser";

describe("documentParser", () => {
  it("extrai tabelas Markdown de planilhas Excel em buffer", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Funcionarios");
    ws.addRows([
      ["Nome", "Cargo", "Salario"],
      ["Ana", "Engenheira", 12000],
      ["Bruno", "Designer", 9000],
    ]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const extracted = await extractTextFromExcel(buffer);

    expect(extracted).toContain("### Planilha: Funcionarios");
    expect(extracted).toContain("| Nome | Cargo | Salario |");
    expect(extracted).toContain("| Ana | Engenheira | 12000 |");
    expect(extracted).toContain("| Bruno | Designer | 9000 |");
  });
});
