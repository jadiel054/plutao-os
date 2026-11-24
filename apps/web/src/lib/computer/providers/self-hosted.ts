/**
 * Fase 5 — ADAPTADOR PREPARADO: navegador self-hosted (mini PC próprio).
 *
 * fala o MESMO protocolo CDP do adaptador Browserless — o browserless
 * open-source em docker expõe a mesma rota /chromium. Assim, trocar o
 * provedor não mexe no Chat, nem na UI, nem no sessionManager:
 *   PLUTAO_COMPUTER_PROVIDER=self-hosted
 *   SELF_HOSTED_COMPUTER_ENDPOINT=wss://mini-pc.local:3100/chromium
 *   SELF_HOSTED_COMPUTER_TOKEN=...   (opcional; gateway com auth)
 *
 * Este adaptador NÃO provisiona infraestrutura: enquanto o endpoint não
 * existir, o provedor reporta-se como não configurado e o gerenciador de
 * sessões recusa criação com PROVIDER_UNCONFIGURED (fail-closed).
 */
import { ComputerProviderError } from "../provider";
import { createBrowserlessProvider, type BrowserlessConfig } from "./browserless";
import type { ComputerProvider } from "../provider";

export type SelfHostedConfig = BrowserlessConfig;

export function readSelfHostedConfig(): SelfHostedConfig | null {
  const endpoint = process.env.SELF_HOSTED_COMPUTER_ENDPOINT?.trim();
  if (!endpoint) return null;
  const token = process.env.SELF_HOSTED_COMPUTER_TOKEN?.trim() || "";
  const maxSessionMs = Math.max(
    10_000,
    Number(process.env.SELF_HOSTED_MAX_SESSION_MS) || 30 * 60 * 1000
  );
  return {
    token,
    endpoint,
    maxSessionMs,
    // Sem provedor externo: não há cota de unidades — orçamento apenas local.
    monthlyBudgetUnits: Number.POSITIVE_INFINITY,
  };
}

export function createSelfHostedProvider(config: SelfHostedConfig): ComputerProvider {
  return {
    kind: "self-hosted",
    isConfigured: () => Boolean(config.endpoint),
    limits: () => ({
      maxSessionMs: config.maxSessionMs,
      maxConcurrentSessions: 1,
      monthlyBudgetUnits: Number.POSITIVE_INFINITY,
      notes: [
        "Navegador próprio (mini PC) — sem custos de provedor",
        "A duração máxima da sessão é configurável (SELF_HOSTED_MAX_SESSION_MS)",
        "Infraestrutura do mini PC não está provisionada; sem endpoint o provedor fica indisponível",
      ],
    }),
    createSession: ({ conversationId, userId }) => {
      if (!config.endpoint) {
        return Promise.reject(
          new ComputerProviderError(
            "PROVIDER_UNCONFIGURED",
            "Navegador self-hosted não configurado (SELF_HOSTED_COMPUTER_ENDPOINT ausente)."
          )
        );
      }
      // Mesmo cliente CDP do adaptador cloud: o browserless open-source em
      // docker expõe a mesma rota /chromium que o serviço gerenciado.
      return createBrowserlessProvider(config).createSession({ conversationId, userId });
    },
  };
}
