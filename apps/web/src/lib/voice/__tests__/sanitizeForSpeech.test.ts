import { describe, expect, it } from "vitest";
import { sanitizeForSpeech } from "../sanitizeForSpeech";

describe("sanitizeForSpeech", () => {
  it("strips bold and italic markers", () => {
    const out = sanitizeForSpeech("Olá **mundo** e *ênfase* e __forte__");
    expect(out).toBe("Olá mundo e ênfase e forte");
    expect(out).not.toMatch(/\*/);
    expect(out).not.toMatch(/_/);
  });

  it("replaces fenced code blocks with spoken placeholder", () => {
    const out = sanitizeForSpeech("Antes\n```ts\nconst x = 1;\n```\nDepois");
    expect(out.toLowerCase()).toContain("código omitido");
    expect(out).not.toContain("const x");
    expect(out).toMatch(/Antes/);
    expect(out).toMatch(/Depois/);
  });

  it("keeps inline code content without backticks", () => {
    const out = sanitizeForSpeech("Use `npm install` agora");
    expect(out).toBe("Use npm install agora");
    expect(out).not.toContain("`");
  });

  it("strips headers and list markers", () => {
    const out = sanitizeForSpeech("# Título\n\n- item um\n- item dois\n1. passo");
    expect(out).not.toMatch(/#/);
    expect(out).toMatch(/Título/);
    expect(out).toMatch(/item um/);
    expect(out).toMatch(/passo/);
  });

  it("turns markdown links into labels and bare urls into link", () => {
    const out = sanitizeForSpeech(
      "Veja [docs](https://plutao-os.vercel.app/ajuda) e https://example.com/path"
    );
    expect(out).toContain("docs");
    expect(out).not.toContain("https://plutao-os");
    expect(out.toLowerCase()).toMatch(/link/);
  });

  it("strips strikethrough", () => {
    const out = sanitizeForSpeech("Isso está ~~errado~~ certo");
    expect(out).toBe("Isso está errado certo");
  });

  it("never collapses non-empty input to empty string", () => {
    expect(sanitizeForSpeech("***").length).toBeGreaterThan(0);
    expect(sanitizeForSpeech("###").length).toBeGreaterThan(0);
  });

  it("returns empty for blank input", () => {
    expect(sanitizeForSpeech("")).toBe("");
    expect(sanitizeForSpeech("   \n\t  ")).toBe("");
  });

  it("handles typical agent reply shape", () => {
    const md = [
      "## Resumo",
      "",
      "O **Plutão** está online.",
      "",
      "1. Conector GitHub ativo",
      "2. Vercel **connected**",
      "",
      "Use `pnpm build` e veja https://plutao-os.vercel.app",
      "",
      "```ts",
      'secret.token = "no"',
      "```",
    ].join("\n");
    const out = sanitizeForSpeech(md);
    expect(out).toMatch(/Plutão/);
    expect(out).toMatch(/Conector GitHub/);
    expect(out.toLowerCase()).toMatch(/código omitido/);
    expect(out).toMatch(/pnpm build/);
    expect(out).not.toMatch(/\*\*/);
    expect(out).not.toContain("`");
    expect(out).not.toContain("secret.token");
  });

  it("truncates to 4000 chars", () => {
    const long = "a".repeat(5000);
    expect(sanitizeForSpeech(long).length).toBeLessThanOrEqual(4000);
  });
});
