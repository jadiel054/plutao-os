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

export interface ReconcileResult {
  processed: number;
  applied: number;
  retryableErrors: number;
  permanentErrors: number;
}

export class Reconciler {
  /**
   * Processa todas as intents elegíveis para um determinado usuário autenticado.
   */
  static async reconcileUserIntents(userId: string): Promise<ReconcileResult> {
    if (!userId) {
      return { processed: 0, applied: 0, retryableErrors: 0, permanentErrors: 0 };
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { processed: 0, applied: 0, retryableErrors: 0, permanentErrors: 0 };
    }

    const intents = await PendingIntentStore.getIntentsByUser(userId);
    const eligible = intents.filter(
      (i) => i.status === "PENDING" || i.status === "FAILED_RETRYABLE"
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

    return { processed, applied, retryableErrors, permanentErrors };
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
