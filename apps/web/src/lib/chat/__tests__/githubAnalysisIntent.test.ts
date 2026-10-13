import { describe, it, expect } from "vitest";
import { detectGitHubToolAction } from "../githubToolRunner";
import { stripInventedToolCalls } from "@/lib/security/sanitize";

describe("GitHub Analysis Intent & Tool JSON Stripping", () => {
  describe("detectGitHubToolAction — Intent Expansion", () => {
    it("detects 'ideias de crescimento para o bugmeme' as repo_get", () => {
      const plan = detectGitHubToolAction("ideias de crescimento para o bugmeme", "jadiel054");
      expect(plan).not.toBeNull();
      expect(plan?.action).toBe("repo_get");
      expect(plan?.owner).toBe("jadiel054");
      expect(plan?.repo).toBe("bugmeme");
    });

    it("detects 'ideias de crescimento para jadiel054/bugmeme' as repo_get", () => {
      const plan = detectGitHubToolAction("ideias de crescimento para jadiel054/bugmeme");
      expect(plan).not.toBeNull();
      expect(plan?.action).toBe("repo_get");
      expect(plan?.owner).toBe("jadiel054");
      expect(plan?.repo).toBe("bugmeme");
    });

    it("detects 'analisa o repositório X' as repo_get", () => {
      const plan = detectGitHubToolAction("analisa o repositório my-cool-app", "user");
      expect(plan).not.toBeNull();
      expect(plan?.action).toBe("repo_get");
      expect(plan?.owner).toBe("user");
      expect(plan?.repo).toBe("my-cool-app");
    });

    it("detects 'como expandir o projeto Y' as repo_get", () => {
      const plan = detectGitHubToolAction("como expandir o projeto super-bot", "user");
      expect(plan).not.toBeNull();
      expect(plan?.action).toBe("repo_get");
      expect(plan?.owner).toBe("user");
      expect(plan?.repo).toBe("super-bot");
    });

    it("detects 'overview do repo jadiel054/bugmeme' as repo_get", () => {
      const plan = detectGitHubToolAction("overview do repo jadiel054/bugmeme");
      expect(plan).not.toBeNull();
      expect(plan?.action).toBe("repo_get");
      expect(plan?.owner).toBe("jadiel054");
      expect(plan?.repo).toBe("bugmeme");
    });

    it("detects 'me fala sobre o bugmeme no GitHub' as repo_get", () => {
      const plan = detectGitHubToolAction("me fala sobre o bugmeme no GitHub", "jadiel054");
      expect(plan).not.toBeNull();
      expect(plan?.action).toBe("repo_get");
      expect(plan?.owner).toBe("jadiel054");
      expect(plan?.repo).toBe("bugmeme");
    });
  });

  describe("stripInventedToolCalls — Defensiveness against fake JSON tool calls", () => {
    it("strips raw JSON connector payloads", () => {
      const input = `Obtendo detalhes do repositório **jadiel054/bugmeme**.

{
  "connector": "github",
  "action": "repo_get",
  "parameters": {
    "owner": "jadiel054",
    "repo": "bugmeme"
  }
}`;
      const result = stripInventedToolCalls(input);
      expect(result).not.toContain("connector");
      expect(result).not.toContain("repo_get");
      expect(result).not.toContain("Obtendo detalhes do repositório");
    });

    it("strips fenced JSON code blocks containing tool actions", () => {
      const input = `Vou consultar os dados:

\`\`\`json
{
  "connector": "github",
  "action": "repo_get"
}
\`\`\`

Aguarde.`;
      const result = stripInventedToolCalls(input);
      expect(result).not.toContain("connector");
      expect(result).toContain("Vou consultar os dados:");
      expect(result).toContain("Aguarde.");
    });

    it("preserves legitimate prose and Markdown formatting", () => {
      const input = `**Resultado final:** O repositório **bugmeme** é uma aplicação Next.js para memes de dev.

1. **Evolução de features**: adicionar suporte a novos templates.
2. **Integração CI/CD**: configurar Vercel preview deploys.`;

      const result = stripInventedToolCalls(input);
      expect(result).toBe(input);
    });
  });
});
