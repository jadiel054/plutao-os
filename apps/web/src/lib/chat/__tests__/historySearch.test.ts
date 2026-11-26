import { describe, expect, it } from "vitest";
import { filterHistory, normalizeSearchText } from "../historySearch";

const history = [
  { id: "1", title: "Relatório de Vendas", subtitle: "planilha", projectName: "Comercial" },
  { id: "2", title: "Ideias de produto", projectName: null },
  { id: "3", title: "Configuração do Vercel", subtitle: "deploy" },
];

describe("normalizeSearchText", () => {
  it("remove acentos e normaliza caixa", () => {
    expect(normalizeSearchText("Relatório ÁÉ")).toBe("relatorio ae");
  });
});

describe("filterHistory", () => {
  it("consulta vazia retorna tudo", () => {
    expect(filterHistory(history, "")).toHaveLength(3);
  });

  it("filtra por titulo ignorando acentos/caixa", () => {
    expect(filterHistory(history, "relatorio").map((h) => h.id)).toEqual(["1"]);
    expect(filterHistory(history, "VERCEL").map((h) => h.id)).toEqual(["3"]);
  });

  it("filtra por projeto e subtitulo", () => {
    expect(filterHistory(history, "comercial").map((h) => h.id)).toEqual(["1"]);
    expect(filterHistory(history, "deploy").map((h) => h.id)).toEqual(["3"]);
  });

  it("termos multiplos sao combinados (AND)", () => {
    expect(filterHistory(history, "vendas planilha").map((h) => h.id)).toEqual(["1"]);
    expect(filterHistory(history, "vendas vercel")).toEqual([]);
  });
});
