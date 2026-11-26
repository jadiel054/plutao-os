import { describe, expect, it } from "vitest";
import { toolLogoFor, providerDisplayName } from "../toolLogos";

describe("toolLogoFor", () => {
  it("mapeia provedores conhecidos para sua identidade visual", () => {
    expect(toolLogoFor("github")).toBe("github");
    expect(toolLogoFor("GitHub")).toBe("github");
    expect(toolLogoFor("vercel")).toBe("vercel");
    expect(toolLogoFor("neon")).toBe("neon");
    expect(toolLogoFor("browser")).toBe("browser");
    expect(toolLogoFor("navegador")).toBe("browser");
  });

  it("retorna fallback generico para provedores desconhecidos", () => {
    expect(toolLogoFor("stripe")).toBe("generic");
    expect(toolLogoFor("")).toBe("generic");
  });
});

describe("providerDisplayName", () => {
  it("normaliza nomes de exibicao", () => {
    expect(providerDisplayName("github")).toBe("GitHub");
    expect(providerDisplayName("neon")).toBe("Neon");
    expect(providerDisplayName("stripe")).toBe("Stripe");
    expect(providerDisplayName("")).toBe("Conector");
  });
});
