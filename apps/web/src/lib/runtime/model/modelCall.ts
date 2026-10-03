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

export async function callModelWithRetry(
  provider: ModelProviderLike,
  messages: ModelMessage[],
  opts: CallModelRetryOptions
): Promise<CallModelWithRetryResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const attempts = Math.max(1, opts.retries + 1);
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
      if (attempt < attempts) {
        await sleep(opts.backoffMs ?? 800);
      }
    }
  }

  throw lastError;
}
