/**
 * Chamada de modelo com retry/backoff para o runtime de missões.
 * Regra de resiliência: em falha de chamada (MODEL_CALL_FAILED), 1 retry com
 * backoff antes de propagar o erro — o caller grava o porquê no log da missão.
 */

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
