/**
 * Erro estruturado de chamada de modelo local para o caminho de missões.
 * Permite capturar status HTTP, snippet de corpo e métricas de diagnóstico
 * sem alterar a classe ou cliente compartilhado (client.ts).
 */
export type ModelCallErrorInfo = {
  httpStatus?: number;
  bodySnippet?: string;
  model?: string;
  baseUrl?: string;
  latencyMs?: number;
};

export class LocalModelCallError extends Error {
  readonly httpStatus?: number;
  readonly bodySnippet?: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly latencyMs?: number;

  constructor(message: string, info: ModelCallErrorInfo = {}) {
    super(message);
    this.name = "LocalModelCallError";
    this.httpStatus = info.httpStatus;
    this.bodySnippet = info.bodySnippet;
    this.model = info.model;
    this.baseUrl = info.baseUrl;
    this.latencyMs = info.latencyMs;
  }

  /** Resumo em uma linha para logs de missão (evidence/UI). */
  summary(): string {
    return [
      this.message,
      this.httpStatus != null ? `http_status=${this.httpStatus}` : null,
      this.model ? `model=${this.model}` : null,
      this.baseUrl ? `endpoint=${this.baseUrl}` : null,
      this.latencyMs != null ? `latency_ms=${this.latencyMs}` : null,
      this.bodySnippet ? `body=${this.bodySnippet}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
  }
}

export type ModelFailureCode =
  | "MODEL_RATE_LIMITED"
  | "MODEL_UNAUTHORIZED"
  | "MODEL_FORBIDDEN"
  | "MODEL_NOT_FOUND"
  | "MODEL_TIMEOUT"
  | "MODEL_PROVIDER_UNAVAILABLE"
  | "MODEL_REQUEST_INVALID"
  | "MODEL_CALL_FAILED";

export type ModelFailure = {
  code: ModelFailureCode;
  category:
    | "RATE_LIMIT"
    | "AUTH"
    | "VALIDATION"
    | "TIMEOUT"
    | "PROVIDER_UNAVAILABLE"
    | "UNKNOWN";
  retryable: boolean;
  provider?: string;
  model?: string;
  httpStatus?: number;
  hint: string;
};

function errorParts(error: unknown) {
  const value = error as {
    message?: unknown;
    httpStatus?: unknown;
    status?: unknown;
    model?: unknown;
  } | null;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : String(value?.message ?? "");
  const explicitStatus = Number(value?.httpStatus ?? value?.status);
  const statusFromMessage = message.match(/\b(?:HTTP|status)\s*[:=]?\s*(\d{3})\b/i)?.[1];
  const httpStatus = Number.isInteger(explicitStatus) && explicitStatus > 0
    ? explicitStatus
    : statusFromMessage
      ? Number(statusFromMessage)
      : undefined;
  return { message: message.toLowerCase(), httpStatus, model: typeof value?.model === "string" ? value.model : undefined };
}

/** Nunca retorna corpo, endpoint, chave ou mensagem do provedor. */
export function classifyModelError(
  error: unknown,
  context: { provider?: string; model?: string } = {}
): ModelFailure {
  const parts = errorParts(error);
  const status = parts.httpStatus;
  const provider = context.provider;
  const model = context.model ?? parts.model;
  const rateLimited = status === 429 || /rate.?limit|too many requests|tokens? per minute|\btpm\b|quota exceeded/.test(parts.message);
  if (rateLimited) {
    return {
      code: "MODEL_RATE_LIMITED",
      category: "RATE_LIMIT",
      retryable: true,
      provider,
      model,
      httpStatus: status,
      hint: "Limite temporário do provedor; aguarde e tente novamente.",
    };
  }
  if (status === 401 || /unauthorized|invalid api key|authentication/.test(parts.message)) {
    return {
      code: "MODEL_UNAUTHORIZED",
      category: "AUTH",
      retryable: false,
      provider,
      model,
      httpStatus: status,
      hint: "A credencial do provedor foi rejeitada; confira a configuração do modelo.",
    };
  }
  if (status === 403 || /forbidden|permission denied/.test(parts.message)) {
    return {
      code: "MODEL_FORBIDDEN",
      category: "AUTH",
      retryable: false,
      provider,
      model,
      httpStatus: status,
      hint: "O provedor recusou o modelo ou a capacidade solicitada.",
    };
  }
  if (status === 404 || /model.*not found|not found.*model/.test(parts.message)) {
    return {
      code: "MODEL_NOT_FOUND",
      category: "VALIDATION",
      retryable: false,
      provider,
      model,
      httpStatus: status,
      hint: "O modelo configurado não foi encontrado no endpoint selecionado.",
    };
  }
  if (status === 408 || /timeout|timed out|deadline exceeded/.test(parts.message)) {
    return {
      code: "MODEL_TIMEOUT",
      category: "TIMEOUT",
      retryable: true,
      provider,
      model,
      httpStatus: status,
      hint: "O provedor demorou além do limite; a missão poderá tentar novamente.",
    };
  }
  if ((status != null && status >= 500) || /service unavailable|temporarily unavailable|bad gateway|gateway timeout/.test(parts.message)) {
    return {
      code: "MODEL_PROVIDER_UNAVAILABLE",
      category: "PROVIDER_UNAVAILABLE",
      retryable: true,
      provider,
      model,
      httpStatus: status,
      hint: "O provedor está indisponível; a missão poderá tentar novamente.",
    };
  }
  return {
    code: "MODEL_CALL_FAILED",
    category: "UNKNOWN",
    retryable: false,
    provider,
    model,
    httpStatus: status,
    hint: "Não foi possível completar a chamada; verifique a configuração do modelo.",
  };
}

import type { ModelMessage, ModelStepResult } from "./types";

export type ModelProviderLike = {
  callModel: (messages: ModelMessage[]) => Promise<ModelStepResult>;
  getProviderType: () => "groq" | "local";
  getModelId: () => string;
};

export type CallModelWithRetryResult = {
  result: ModelStepResult;
  providerType: "groq" | "local";
  modelId: string;
  attempts: number;
};

export type CallModelRetryOptions = {
  /** Retries ADICIONAIS após a primeira tentativa (ex.: 1 = 2 tentativas). */
  retries: number;
  backoffMs?: number;
  /** Injetável para testes. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Tenta parsear instrução de espera ("try again in Xms" ou "try again in Xs") do erro
 * e/ou do header / propriedade Retry-After.
 */
export function parseRetryHint(err: unknown): number | null {
  if (!err) return null;

  let messageStr = "";
  if (typeof err === "string") {
    messageStr = err;
  } else if (err instanceof Error) {
    messageStr = err.message;
  } else if (typeof err === "object") {
    messageStr = String((err as { message?: unknown }).message ?? "");
  }

  // Tentar extrair do body/mensagem "try again in Xms" ou "try again in Xs" ou "try again in X.Y s"
  const matchMs = messageStr.match(/try again in\s+(\d+(?:\.\d+)?)\s*ms/i);
  if (matchMs && matchMs[1]) {
    const ms = parseFloat(matchMs[1]);
    if (!isNaN(ms) && ms >= 0) return Math.round(ms);
  }

  const matchSec = messageStr.match(/try again in\s+(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?/i);
  if (matchSec && matchSec[1]) {
    const sec = parseFloat(matchSec[1]);
    if (!isNaN(sec) && sec >= 0) return Math.round(sec * 1000);
  }

  // Tentar extrair do header/propriedade retryAfter
  if (typeof err === "object" && err !== null) {
    const rawRetryHeader =
      (err as { retryAfter?: unknown }).retryAfter ??
      (err as { headers?: Record<string, unknown> }).headers?.["retry-after"];
    if (rawRetryHeader != null) {
      const headerStr = String(rawRetryHeader).trim();
      const val = parseFloat(headerStr);
      if (!isNaN(val) && val >= 0) {
        // Se for inteiro/float pequeno (em segundos), converter para ms, senão tratar como ms se > 1000
        return val < 1000 ? Math.round(val * 1000) : Math.round(val);
      }
    }
  }

  return null;
}

export async function callModelWithRetry(
  provider: ModelProviderLike,
  messages: ModelMessage[],
  opts: CallModelRetryOptions
): Promise<CallModelWithRetryResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const attempts = Math.max(1, opts.retries + 1);
  const baseBackoff = opts.backoffMs ?? 800;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const startTime = Date.now();
    try {
      const result = await provider.callModel(messages);
      return {
        result: {
          ...result,
          latencyMs: result.latencyMs ?? Date.now() - startTime,
        },
        providerType: provider.getProviderType(),
        modelId: provider.getModelId(),
        attempts: attempt,
      };
    } catch (e) {
      lastError = e;
      const failure = classifyModelError(e, {
        provider: provider.getProviderType(),
        model: provider.getModelId(),
      });
      if (attempt < attempts && failure.retryable) {
        const hintMs = parseRetryHint(e);
        const exponentialBackoff = baseBackoff * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 200;
        const totalWait = hintMs !== null ? hintMs + exponentialBackoff + jitter : exponentialBackoff + jitter;

        await sleep(Math.round(totalWait));
      }
    }
  }

  throw lastError;
}
