import { describe, expect, it } from "vitest";
import { parseVoiceCommand, pageIdForRoute, respondToVoiceCommand } from "../voice-assist";

describe("parseVoiceCommand", () => {
  it("mapeia comandos naturais pt-BR", () => {
    expect(parseVoiceCommand("Nix, leia o que está escrito aqui").intent).toBe("read_screen");
    expect(parseVoiceCommand("Essa opção está ativada?").intent).toBe("query_state");
    expect(parseVoiceCommand("Desative essa configuração").intent).toBe("toggle_control");
    expect(parseVoiceCommand("Explique o que essa função faz").intent).toBe("explain");
    expect(parseVoiceCommand("Nix, abra o cockpit").intent).toBe("navigate");
    expect(parseVoiceCommand("Nix, volte para o chat").intent).toBe("navigate");
    expect(parseVoiceCommand("Configure isso para atingir meu objetivo").intent).toBe("guided_goal");
    expect(parseVoiceCommand('Nix, escreva bom dia com "bom dia" no campo').intent).toBe("fill_input");
    expect(parseVoiceCommand("Nix, abra a ajuda").intent).toBe("navigate");
    expect(parseVoiceCommand("Selecione o modelo com \"gemini\"").intent).toBe("select_option");
  });
});

describe("pageIdForRoute (superfícies conhecidas vs desconhecidas)", () => {
  it("rotas registradas identificam a página", () => {
    expect(pageIdForRoute("/chat")).toBe("chat");
    expect(pageIdForRoute("/ajuda")).toBe("ajuda");
  });
  it("rota NÃO registrada NUNCA é assumida como chat", () => {
    expect(pageIdForRoute("/pagina-estranha")).toBe("desconhecida");
    expect(pageIdForRoute("/pagina-estranha")).not.toBe("chat");
  });
});

describe("respondToVoiceCommand", () => {
  it("navegação retorna rota", () => {
    const r = respondToVoiceCommand(parseVoiceCommand("abra o cockpit"), { pageId: "chat" });
    expect(r.navigateTo).toBe("/cockpit");
  });
  it("toggle em página com controles gera interação; sensível pede confirmação", () => {
    const r = respondToVoiceCommand(parseVoiceCommand("desative essa configuração"), { pageId: "configuracoes" });
    expect(r.interaction?.steps.length).toBeGreaterThan(0);
  });
  it("leitura de tela pede snapshot quando não há estado", () => {
    const r = respondToVoiceCommand(parseVoiceCommand("leia o que está escrito"), { pageId: "chat" });
    expect(r.needsPageState).toBe(true);
  });
  it("leitura de tela usa o TEXTO REAL recebido no snapshot", () => {
    const r = respondToVoiceCommand(parseVoiceCommand("leia o que está escrito"), {
      pageId: "chat",
      hasPageState: true,
      visibleText: "Saldo disponível: R$ 42,00",
    });
    expect(r.reply).toContain("Saldo disponível: R$ 42,00");
  });
  it("sem texto visível, NÃO afirma que leu conteúdo", () => {
    const r = respondToVoiceCommand(parseVoiceCommand("leia o que está escrito"), {
      pageId: "chat",
      hasPageState: true,
      visibleText: "",
    });
    expect(r.reply).not.toContain("Conversa com a Nix");
    expect(r.reply).toContain("não há conteúdo lido");
  });
  it("página desconhecida NÃO usa a finalidade estática do Chat", () => {
    const r = respondToVoiceCommand(parseVoiceCommand("leia o que está escrito"), {
      pageId: "desconhecida",
      hasPageState: true,
      visibleText: "texto qualquer",
    });
    expect(r.reply).not.toContain("Conversa com a Nix");
    expect(r.reply).toContain("não identificada");
  });
  it("explain em página desconhecida é neutro", () => {
    const r = respondToVoiceCommand(parseVoiceCommand("explique essa página"), { pageId: "desconhecida" });
    expect(r.reply).toContain("Não identifiquei");
  });
});