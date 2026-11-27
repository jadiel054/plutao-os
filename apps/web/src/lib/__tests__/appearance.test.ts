import { describe, expect, it } from "vitest";
import { mergeAppearance } from "../appearance";

describe("mergeAppearance — bootstrap da fonte preserva preferências", () => {
  it("tema claro, densidade compacta e idioma sobrevivem ao bootstrap do fontScale", () => {
    const existing = { theme: "light", density: "compact", language: "en-US" };
    const afterBootstrap = mergeAppearance(existing, { fontScale: "large" });
    expect(afterBootstrap).toEqual({
      theme: "light",
      density: "compact",
      language: "en-US",
      fontScale: "large",
    });
  });

  it("escrita posterior de tema não apaga density/language/fontScale", () => {
    const existing = { theme: "light", density: "compact", language: "en-US", fontScale: "large" };
    const next = mergeAppearance(existing, { theme: "dark" });
    expect(next).toEqual({ theme: "dark", density: "compact", language: "en-US", fontScale: "large" });
  });

  it("rejeita valores inválidos em vez de gravá-los", () => {
    const next = mergeAppearance({}, {
      theme: "purple" as never,
      density: "mega" as never,
      language: "xx" as never,
      fontScale: "huge" as never,
    });
    expect(next).toEqual({});
  });

  it("base inválida (null/lixeira) é tratada como vazia", () => {
    expect(mergeAppearance(null, { fontScale: "small" })).toEqual({ fontScale: "small" });
    expect(mergeAppearance("lixo", { fontScale: "small" })).toEqual({ fontScale: "small" });
  });
});
