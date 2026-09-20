import { describe, it, expect } from "vitest";
import { buildReasoningSteps } from "../buildReasoningSteps";
import { detectSuggestedConnectors } from "../suggestConnectors";

describe("buildReasoningSteps", () => {
  it("decomposes GitHub issues intent with connected GitHub account into 6 core steps ending in decision", () => {
    const steps = buildReasoningSteps({
      userMessage: "liste as issues do meu repositório plutao-os",
      githubConnected: true,
      githubLogin: "jadiel054",
    });

    expect(steps).toHaveLength(6);
    expect(steps[0].text).toBe('▸ Lendo sua mensagem: "liste as issues do meu repositório plutao-os"');
    expect(steps[1].text).toBe("▸ Intenção: auditoria de issues de um repositório específico");
    expect(steps[2].text).toBe("▸ Contexto: conector GitHub conectado (@jadiel054)");
    expect(steps[3].text).toBe('▸ Suposição: "meu repositório" = jadiel054/plutao-os');
    expect(steps[4].text).toBe("▸ Caminho: preciso só consultar — issues_list resolve, sem escrita");
    expect(steps[5].text).toBe("▸ Decisão: chamar issues_list e responder com o resumo.");
  });

  it("handles GitHub intent when GitHub connector is disconnected", () => {
    const steps = buildReasoningSteps({
      userMessage: "liste as PRs do repositório plutao-os",
      githubConnected: false,
      githubLogin: null,
    });

    expect(steps).toHaveLength(5);
    expect(steps[0].text).toBe('▸ Lendo sua mensagem: "liste as PRs do repositório plutao-os"');
    expect(steps[1].text).toBe('▸ Intenção: consulta ao GitHub ("plutao-os")');
    expect(steps[2].text).toBe("▸ Contexto: conector GitHub não conectado");
    expect(steps[3].text).toBe("▸ Caminho: conector ausente — orientar conexão necessária");
    expect(steps[4].text).toBe("▸ Decisão: responder direto: orientação para conectar conta do GitHub.");
  });

  it("handles Vercel intent when Vercel connector is connected", () => {
    const steps = buildReasoningSteps({
      userMessage: "liste meus projetos na Vercel",
      snapshot: {
        connectors: [],
        systemBlock: "",
        githubConnected: false,
        githubLogin: null,
        vercelConnected: true,
        vercelLogin: "jadiel054",
        vercelToken: "vcl_123",
      },
    });

    expect(steps).toHaveLength(5);
    expect(steps[1].text).toBe("▸ Intenção: consulta ao conector Vercel");
    expect(steps[2].text).toBe("▸ Contexto: conector Vercel conectado (@jadiel054)");
    expect(steps[3].text).toBe("▸ Caminho: consultar API Vercel via runner do conector");
    expect(steps[4].text).toBe("▸ Decisão: chamar Vercel API e responder com os dados reais.");
  });

  it("decomposes casual chat or general technical question without tools", () => {
    const steps = buildReasoningSteps({
      userMessage: "bom dia, como você funciona?",
      githubConnected: true,
      githubLogin: "jadiel054",
      artifactsCount: 1,
      hasActiveMission: true,
    });

    expect(steps).toHaveLength(5);
    expect(steps[0].text).toBe('▸ Lendo sua mensagem: "bom dia, como você funciona?"');
    expect(steps[1].text).toBe("▸ Intenção: dúvida técnica / esclarecimento");
    expect(steps[2].text).toContain("1 arquivo(s) anexado(s)");
    expect(steps[2].text).toContain("missão ativa vinculada");
    expect(steps[3].text).toBe("▸ Caminho: resposta direta via modelo de linguagem, sem chamadas a ferramentas");
    expect(steps[4].text).toBe("▸ Decisão: responder direto: resposta clara e objetiva.");
  });
});

describe("detectSuggestedConnectors", () => {
  it("suggests GitHub connector when disconnected and query refers to GitHub", () => {
    const suggestions = detectSuggestedConnectors({
      lastUserText: "mostrar meus repositórios",
      assistantText: "Você precisa conectar o GitHub.",
      githubConnected: false,
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].provider).toBe("github");
  });

  it("suggests Vercel connector when disconnected and query refers to Vercel", () => {
    const suggestions = detectSuggestedConnectors({
      lastUserText: "liste meus projetos na vercel",
      assistantText: "A Vercel não está conectada.",
      vercelConnected: false,
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].provider).toBe("vercel");
  });
});
