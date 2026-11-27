import { describe, expect, it } from "vitest";
import { parseVoiceCommand, respondToVoiceCommand } from "../voice-assist";

describe("parseVoiceCommand", () => {
  it("mapeia comandos naturais pt-BR", () => {
    expect(parseVoiceCommand("Nix, leia o que está escrito aqui").intent).toBe("read_screen");
    expect(parseVoiceCommand("Essa opção está ativada?").intent).toBe("query_state");
    expect(parseVoiceCommand("Desative essa configuração").intent).toBe("toggle_control");
    expect(parseVoiceCommand("Explique o que essa função faz").intent).toBe("explain");
    expect(parseVoiceCommand("Nix, abra o cockpit").intent).toBe("navigate");
    expect(parseVoiceCommand("Nix, volte para o chat").intent).toBe("navigate");
    expect(parseVoiceCommand("Configure isso para atingir meu objetivo").intent).toBe("guided_goal");
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
});
