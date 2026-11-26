import { describe, expect, it } from "vitest";
import {
  parseVisualBlocks,
  normalizeChartSpec,
  parseTableBody,
  tableToChartSpec,
} from "../visualBlocks";

const T = "```";

describe("parseVisualBlocks", () => {
  it("extrai bloco chart valido como visual", () => {
    const content = [
      "Texto antes.",
      "",
      T + "chart",
      '{"type":"bar","title":"Vendas","unit":"R$","data":[{"label":"Jan","value":120},{"label":"Fev","value":90}]}',
      T,
      "",
      "Texto depois.",
    ].join("\n");
    const parts = parseVisualBlocks(content);
    expect(parts.map((p) => p.kind)).toEqual(["text", "visual", "text"]);
    const visual = parts[1];
    if (visual.kind !== "visual") return expect.unreachable();
    if (visual.spec.kind !== "chart") return expect.unreachable();
    expect(visual.spec.chartType).toBe("bar");
    expect(visual.spec.title).toBe("Vendas");
    expect(visual.spec.data).toEqual([{ label: "Jan", value: 120 }, { label: "Fev", value: 90 }]);
  });

  it("mantem chart com JSON invalido como codigo (nao inventa dados)", () => {
    const parts = parseVisualBlocks(T + "chart\n{invalid}\n" + T);
    expect(parts.map((p) => p.kind)).toEqual(["code"]);
  });

  it("extrai bloco table em CSV", () => {
    const parts = parseVisualBlocks(T + "table\nMês,Receita\nJan,120\nFev,90\n" + T);
    const visual = parts[0];
    if (visual.kind !== "visual") return expect.unreachable();
    if (visual.spec.kind !== "table") return expect.unreachable();
    expect(visual.spec.columns).toEqual(["Mês", "Receita"]);
    expect(visual.spec.rows).toEqual([["Jan", "120"], ["Fev", "90"]]);
  });

  it("extrai bloco table em JSON de objetos", () => {
    const parts = parseVisualBlocks(T + "table\n" + JSON.stringify([{ nome: "A", qtd: 2 }, { nome: "B", qtd: 5 }]) + "\n" + T);
    const visual = parts[0];
    if (visual.kind !== "visual" || visual.spec.kind !== "table") return expect.unreachable();
    expect(visual.spec.columns).toEqual(["nome", "qtd"]);
    expect(visual.spec.rows).toEqual([["A", "2"], ["B", "5"]]);
  });
});

describe("normalizeChartSpec", () => {
  it("aceita labels/values com numeros em texto pt-BR", () => {
    const spec = normalizeChartSpec({ type: "line", labels: ["a", "b"], values: ["1,5", 2] });
    expect(spec?.chartType).toBe("line");
    expect(spec?.data).toEqual([{ label: "a", value: 1.5 }, { label: "b", value: 2 }]);
  });

  it("rejeita dados sem pontos validos", () => {
    expect(normalizeChartSpec({ type: "bar", data: [{ label: "x", value: "nan" }] })).toBeNull();
    expect(normalizeChartSpec(null)).toBeNull();
    expect(normalizeChartSpec({ data: [] })).toBeNull();
  });

  it("limita a 12 pontos", () => {
    const data = Array.from({ length: 30 }, (_, i) => ({ label: "i" + i, value: i }));
    expect(normalizeChartSpec({ type: "bar", data })?.data).toHaveLength(12);
  });
});

describe("parseTableBody", () => {
  it("suporta separador ponto-e-virgula", () => {
    const spec = parseTableBody("Nome;Valor\nA;1\nB;2");
    expect(spec?.columns).toEqual(["Nome", "Valor"]);
  });
});

describe("tableToChartSpec", () => {
  it("converte coluna categorica + numerica", () => {
    const spec = parseTableBody("Mês,Receita\nJan,120\nFev,90\nMar,200");
    const chart = spec ? tableToChartSpec(spec) : null;
    expect(chart?.data).toEqual([
      { label: "Jan", value: 120 },
      { label: "Fev", value: 90 },
      { label: "Mar", value: 200 },
    ]);
  });
});
