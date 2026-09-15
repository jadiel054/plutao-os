/**
 * @plutao/web — Reconciler
 * Processes PendingIntents when connectivity is restored.
 * Aligned with Marco B: Reconciliador online + Concorrência (Locking) + Erros.
 */

import {
  PendingIntent,
  CreateMissionPayload,
  transitionIntent,
} from "@plutao/domain";
import { PendingIntentStore } from "./pendingIntentStore";

// Trava em memória por aba para impedir reconciliações concorrentes do mesmo intentId
const activeLocks = new Set<string>();

/**
 * Timeout para considerar uma intent em estado SYNCING como órfã/abandonada (60s)
 */
export const SYNCING_ORPHAN_TIMEOUT_MS = 60 * 1000;

/**
 * Calcula o tempo de espera (backoff exponencial com teto) para intents em FAILED_RETRYABLE.
 * Tentativas: 1 -> 5s, 2 -> 15s, 3 -> 45s, 4+ -> 120s (teto 2 min)
 */
export function getBackoffDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  const baseMs = 5000;
  const calculated = baseMs * Math.pow(3, attempts - 1);
  const maxMs = 2 * 60 * 1000; // 2 minutos
  return Math.min(calculated, maxMs);
}

/**
 * Verifica se uma intent em FAILED_RETRYABLE já cumpriu sua janela de backoff.
 */
export function isRetryableEligible(intent: PendingIntent): boolean {
  if (intent.status === "PENDING") return true;
  if (intent.status !== "FAILED_RETRYABLE") return false;
  if (!intent.lastAttemptAt) return true;

  const delayMs = getBackoffDelayMs(intent.attempts);
  const elapsedMs = Date.now() - new Date(intent.lastAttemptAt).getTime();
  return elapsedMs >= delayMs;
}

export interface ReconcileResult {
  processed: number;
  applied: number;
  retryableErrors: number;
  permanentErrors: number;
  orphansRecovered: number;
}

export class Reconciler {
  /**
   * Processa todas as intents elegíveis para um determinado usuário autenticado.
   */
  static async reconcileUserIntents(userId: string): Promise<ReconcileResult> {
    if (!userId) {
      return {
        processed: 0,
        applied: 0,
        retryableErrors: 0,
        permanentErrors: 0,
        orphansRecovered: 0,
      };
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return {
        processed: 0,
        applied: 0,
        retryableErrors: 0,
        permanentErrors: 0,
        orphansRecovered: 0,
      };
    }

    let intents = await PendingIntentStore.getIntentsByUser(userId);
    let orphansRecovered = 0;

    // 1. Recuperação de SYNCING Órfãos
    const now = Date.now();
    for (const intent of intents) {
      if (intent.status === "SYNCING" && !activeLocks.has(intent.intentId)) {
        const lastAttempt = intent.lastAttemptAt
          ? new Date(intent.lastAttemptAt).getTime()
          : 0;
        if (now - lastAttempt > SYNCING_ORPHAN_TIMEOUT_MS) {
          // SYNCING abandonada -> transiciona para FAILED_RETRYABLE para permitir recuperação
          const recovered = {
            ...intent,
            status: "FAILED_RETRYABLE" as const,
            lastError: "Reconciliação interrompida (SYNCING órfão recuperado)",
            updatedAt: new Date().toISOString(),
          };
          await PendingIntentStore.saveIntent(recovered);
          orphansRecovered++;
        }
      }
    }

    if (orphansRecovered > 0) {
      intents = await PendingIntentStore.getIntentsByUser(userId);
    }

    // 2. Filtragem com Backoff Efetivo
    const eligible = intents.filter(
      (i) => i.status === "PENDING" || isRetryableEligible(i)
    );

    let processed = 0;
    let applied = 0;
    let retryableErrors = 0;
    let permanentErrors = 0;

    for (const intent of eligible) {
      if (activeLocks.has(intent.intentId)) {
        continue;
      }

      activeLocks.add(intent.intentId);
      processed++;

      try {
        const result = await this.processSingleIntent(intent);
        if (result === "APPLIED") applied++;
        else if (result === "FAILED_RETRYABLE") retryableErrors++;
        else if (result === "FAILED_PERMANENT") permanentErrors++;
      } finally {
        activeLocks.delete(intent.intentId);
      }
    }

    return { processed, applied, retryableErrors, permanentErrors, orphansRecovered };
  }

  /**
   * Processa uma única intent.
   */
  static async processSingleIntent(intent: PendingIntent): Promise<string> {
    // Transição PENDING/FAILED_RETRYABLE -> SYNCING
    let currentIntent = transitionIntent(intent, "SYNCING");
    await PendingIntentStore.saveIntent(currentIntent);

    try {
      if (currentIntent.type === "CREATE_MISSION") {
        const payload = currentIntent.payload as CreateMissionPayload;
        const response = await fetch("/api/missions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": currentIntent.idempotencyKey,
          },
          body: JSON.stringify({
            objective: payload.objective,
            context: payload.context,
            constraints: payload.constraints,
            definitionOfDone: payload.definitionOfDone,
            intentId: currentIntent.intentId,
            idempotencyKey: currentIntent.idempotencyKey,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          currentIntent = transitionIntent(currentIntent, "APPLIED", {
            result: {
              remoteId: data.mission?.id,
              responseData: data,
            },
          });
          await PendingIntentStore.saveIntent(currentIntent);
          return "APPLIED";
        }

        const status = response.status;
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error || `HTTP ${status}`;

        // HTTP 4xx (exceto 429/408) é permanente. HTTP 5xx, 429, 408 é retryable.
        const isPermanent =
          status >= 400 && status < 500 && status !== 429 && status !== 408;

        if (isPermanent) {
          currentIntent = transitionIntent(currentIntent, "FAILED_PERMANENT", {
            error: errMsg,
          });
          await PendingIntentStore.saveIntent(currentIntent);
          return "FAILED_PERMANENT";
        } else {
          currentIntent = transitionIntent(currentIntent, "FAILED_RETRYABLE", {
            error: errMsg,
          });
          await PendingIntentStore.saveIntent(currentIntent);
          return "FAILED_RETRYABLE";
        }
      }

      // Tipo desconhecido = permanente
      currentIntent = transitionIntent(currentIntent, "FAILED_PERMANENT", {
        error: `Tipo de intent não suportado: ${currentIntent.type}`,
      });
      await PendingIntentStore.saveIntent(currentIntent);
      return "FAILED_PERMANENT";
    } catch (e: unknown) {
      // Erro de rede/conexão perdida = FAILED_RETRYABLE
      const errMsg = e instanceof Error ? e.message : "Erro de rede";
      currentIntent = transitionIntent(currentIntent, "FAILED_RETRYABLE", {
        error: errMsg,
      });
      await PendingIntentStore.saveIntent(currentIntent);
      return "FAILED_RETRYABLE";
    }
  }
}
