import { describe, expect, it } from "vitest";
import { classifyChatIntent, detectExplicitMissionRequest } from "../intent";
import { detectBuildContinuation } from "../../missions/autoMissionRules";

describe("classificação de intenção do Chat (separação Chat × Cockpit)", () => {
  it("'Crie um sistema' inicia criação direta (build), nunca missão", () => {
    expect(classifyChatIntent("Crie um sistema completo de gerenciamento para uma padaria.")).toBe("build");
    expect(classifyChatIntent("crie um site")).toBe("build");
    expect(classifyChatIntent("Crie um site estático de padaria com página única")).toBe("build");
    expect(classifyChatIntent("desenvolva um app de tarefas")).toBe("build");
    expect(detectExplicitMissionRequest("Crie um site")).toBe(false);
    expect(detectExplicitMissionRequest("crie um sistema completo de gerenciamento")).toBe(false);
  });

  it("'Corrija este sistema' continua o fluxo de desenvolvimento (build)", () => {
    expect(classifyChatIntent("corrija este sistema")).toBe("build");
    expect(detectBuildContinuation("adicione uma página de contatos no site")).toBe(true);
    expect(detectBuildContinuation("melhore o design do app")).toBe(true);
    expect(detectBuildContinuation("corrija a missão")).toBe(false);
  });

  it("'Crie uma missão para auditar...' cria missão operacional (explicito)", () => {
    expect(classifyChatIntent("Crie uma missão para auditar o repositório plutao-os")).toBe("mission");
    expect(classifyChatIntent("abra uma missão no Cockpit para monitorar o deploy")).toBe("mission");
    expect(classifyChatIntent("crie mission para rodar a auditoria")).toBe("mission");
  });

  it("consultas e análises não geram criação nem missão", () => {
    expect(classifyChatIntent("analise o repositório plutao-os")).toBe("conversation");
    expect(classifyChatIntent("me explique como funciona a cobrança")).toBe("conversation");
    expect(classifyChatIntent("quais ideias de crescimento para o site?")).toBe("conversation");
  });
});
