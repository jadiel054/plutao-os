"use client";

import { useCallback, useEffect, useState } from "react";
import { PendingIntent, CreateMissionPayload } from "@plutao/domain";
import { PendingIntentStore } from "@/lib/offline/pendingIntentStore";
import { Reconciler } from "@/lib/offline/reconciler";

export function usePendingIntents(userId: string | null) {
  const [intents, setIntents] = useState<PendingIntent[]>([]);
  const [syncing, setSyncing] = useState(false);

  const reloadIntents = useCallback(async () => {
    if (!userId) {
      setIntents([]);
      return;
    }
    try {
      const list = await PendingIntentStore.getIntentsByUser(userId);
      setIntents(list);
    } catch {
      // Ignore indexedDB errors gracefully
    }
  }, [userId]);

  const reconcile = useCallback(async () => {
    if (!userId || syncing) return;
    setSyncing(true);
    try {
      await Reconciler.reconcileUserIntents(userId);
      await reloadIntents();
    } finally {
      setSyncing(false);
    }
  }, [userId, syncing, reloadIntents]);

  const createOfflineMissionIntent = useCallback(
    async (payload: CreateMissionPayload): Promise<PendingIntent<CreateMissionPayload>> => {
      if (!userId) {
        throw new Error("Usuário não autenticado");
      }
      const intentId = crypto.randomUUID();
      const now = new Date().toISOString();

      const newIntent: PendingIntent<CreateMissionPayload> = {
        intentId,
        userId,
        idempotencyKey: intentId,
        type: "CREATE_MISSION",
        payload,
        status: "PENDING",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };

      await PendingIntentStore.saveIntent(newIntent);
      await reloadIntents();

      // Tenta reconciliar imediatamente se estiver online
      if (typeof navigator !== "undefined" && navigator.onLine) {
        void reconcile();
      }

      return newIntent;
    },
    [userId, reloadIntents, reconcile]
  );

  useEffect(() => {
    void reloadIntents();

    const handleOnline = () => {
      void reconcile();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
    };
  }, [reloadIntents, reconcile]);

  return {
    intents,
    syncing,
    reloadIntents,
    reconcile,
    createOfflineMissionIntent,
  };
}
