/**
 * Fases 1+4 — variáveis de ambiente do Computador do Plutão (apenas NOMES
 * aqui: valores vivem apenas no servidor; nunca imprimir valores).
 */
export const COMPUTE_PROVIDER_ENV = {
  name: "PLUTAO_COMPUTER_PROVIDER",
  fallback: "browserless",
} as const;

export const BROWSERLESS_ENV_NAMES = {
  token: "BROWSERLESS_API_TOKEN",
  endpoint: "BROWSERLESS_ENDPOINT",
  maxSessionMs: "BROWSERLESS_MAX_SESSION_MS",
  monthlyUnits: "PLUTAO_COMPUTER_MONTHLY_UNITS",
} as const;

export const SELF_HOSTED_ENV_NAMES = {
  endpoint: "SELF_HOSTED_COMPUTER_ENDPOINT",
  token: "SELF_HOSTED_COMPUTER_TOKEN",
  maxSessionMs: "SELF_HOSTED_MAX_SESSION_MS",
} as const;

/** Nomes para mensagem/auditoria — os valores NUNCA saem do servidor. */
export const COMPUTER_ENV_NAMES = {
  provider: COMPUTE_PROVIDER_ENV.name,
  browserless: BROWSERLESS_ENV_NAMES,
  selfHosted: SELF_HOSTED_ENV_NAMES,
} as const;
