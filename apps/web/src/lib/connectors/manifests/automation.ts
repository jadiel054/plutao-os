import type { ConnectorManifest } from "./types";

function internal(provider: "maestro" | "appium" | "playwright" | "androidworld", displayName: string, capability: string, description: string, mode: "read" | "write"): ConnectorManifest {
  return {
    provider,
    displayName,
    description,
    category: "automação",
    featured: false,
    authMode: "internal",
    runtimeOnly: true,
    baseUrl: "https://api.github.com",
    capabilities: [{ name: capability, description, mode, request: { method: "POST", path: `/internal/${provider}` }, requiredArgs: ["nonce"] }],
  };
}

export const maestroManifest = internal("maestro", "Maestro", "device_execute", "Executar fluxo declarativo Maestro versionado no repositório.", "write");
export const appiumManifest = internal("appium", "Appium", "device_execute", "Executar ações Appium UiAutomator2 allowlisted em Android.", "write");
export const playwrightManifest = internal("playwright", "Playwright", "browser_execute", "Validar uma página web ou deployment com browser isolado.", "write");
export const androidworldManifest = internal("androidworld", "AndroidWorld", "benchmark_execute", "Medir uma tarefa Android padronizada para avaliação do agente.", "read");
