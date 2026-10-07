import { describe, expect, it } from "vitest";
import {
  extractAnswerSections,
  parseMarkdownTableBlock,
} from "../answerFormatting";

describe("extractAnswerSections", () => {
  it("extracts an explicitly labelled result and preserves evidence text", () => {
    const content = [
      "A coleta analisou as métricas retornadas.",
      "**Resultado final:** O repositório A ficou em primeiro lugar.",
      "**Evidência:** Foram consultadas issues e pull requests.",
    ].join("\n\n");

    expect(extractAnswerSections(content)).toEqual({
      result: {
        label: "Resultado",
        content: "O repositório A ficou em primeiro lugar.",
      },
      body: [
        "A coleta analisou as métricas retornadas.",
        "**Evidência:** Foram consultadas issues e pull requests.",
      ].join("\n\n"),
    });
  });

  it("uses the next paragraph after a result heading and leaves following sections in the body", () => {
    const content = [
      "## Resultado final",
      "A conclusão principal está aqui.",
      "## Limitações",
      "O período não pôde ser filtrado.",
    ].join("\n\n");

    expect(extractAnswerSections(content)).toEqual({
      result: { label: "Resultado", content: "A conclusão principal está aqui." },
      body: "## Limitações\n\nO período não pôde ser filtrado.",
    });
  });

  it("accepts the colon after the closing Markdown emphasis markers", () => {
    expect(extractAnswerSections("**Resultado final**: O achado está claro.")).toEqual({
      result: { label: "Resultado", content: "O achado está claro." },
      body: "",
    });
  });

  it("does not infer a highlight when the assistant did not provide an explicit label", () => {
    const content = "O repositório A ficou em primeiro lugar, segundo a análise.";
    expect(extractAnswerSections(content)).toEqual({ result: null, body: content });
  });

  it("does not remove an empty or excessively long result section", () => {
    expect(extractAnswerSections("**Resultado final:**\n\n**Evidência:** disponível")).toEqual({
      result: null,
      body: "**Resultado final:**\n\n**Evidência:** disponível",
    });
    const longResult = `**Resultado final:** ${"x".repeat(4_001)}`;
    expect(extractAnswerSections(longResult)).toEqual({ result: null, body: longResult });
  });
});

describe("parseMarkdownTableBlock", () => {
  it("parses a Markdown table and escaped pipes", () => {
    expect(
      parseMarkdownTableBlock([
        "| Repositório | Issues | Atividade |",
        "| --- | ---: | --- |",
        "| alpha | 3 | pull requests \\| commits |",
        "| beta | 1 | issues |",
      ].join("\n"))
    ).toEqual({
      headers: ["Repositório", "Issues", "Atividade"],
      rows: [
        ["alpha", "3", "pull requests | commits"],
        ["beta", "1", "issues"],
      ],
    });
  });

  it("pads short rows and ignores malformed separators", () => {
    expect(
      parseMarkdownTableBlock("A | B\n--- | ---\nonly-one")
    ).toEqual({ headers: ["A", "B"], rows: [["only-one", ""]] });
    expect(parseMarkdownTableBlock("not | a | table\njust text")).toBeNull();
  });
});
