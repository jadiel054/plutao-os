import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PendingIntent,
  canTransitionIntentStatus,
  transitionIntent,
  CreateMissionPayload,
} from "@plutao/domain";
import { Reconciler, SYNCING_ORPHAN_TIMEOUT_MS } from "../reconciler";
import { PendingIntentStore } from "../pendingIntentStore";

// In-memory fake IndexedDB storage map for testing
const fakeStore = new Map<string, PendingIntent>();

vi.spyOn(PendingIntentStore, "saveIntent").mockImplementation(async (intent) => {
  fakeStore.set(intent.intentId, { ...intent });
});

vi.spyOn(PendingIntentStore, "getIntentsByUser").mockImplementation(async (userId) => {
  return Array.from(fakeStore.values()).filter((i) => i.userId === userId);
});

vi.spyOn(PendingIntentStore, "getIntentById").mockImplementation(async (intentId, userId) => {
  const item = fakeStore.get(intentId);
  if (item && item.userId === userId) return { ...item };
  return null;
});

vi.spyOn(PendingIntentStore, "removeIntent").mockImplementation(async (intentId, userId) => {
  const item = fakeStore.get(intentId);
  if (item && item.userId === userId) {
    fakeStore.delete(intentId);
    return true;
  }
  return false;
});

describe("Marco A — Contrato PendingIntent & Máquina de Estados", () => {
  it("deve validar transições de estado estritas", () => {
    expect(canTransitionIntentStatus("PENDING", "SYNCING")).toBe(true);
    expect(canTransitionIntentStatus("SYNCING", "APPLIED")).toBe(true);
    expect(canTransitionIntentStatus("SYNCING", "FAILED_RETRYABLE")).toBe(true);
    expect(canTransitionIntentStatus("SYNCING", "FAILED_PERMANENT")).toBe(true);
    expect(canTransitionIntentStatus("FAILED_RETRYABLE", "SYNCING")).toBe(true);

    expect(canTransitionIntentStatus("PENDING", "APPLIED")).toBe(false);
    expect(canTransitionIntentStatus("APPLIED", "SYNCING")).toBe(false);
    expect(canTransitionIntentStatus("FAILED_PERMANENT", "SYNCING")).toBe(false);
  });

  it("deve realizar transições de estado com incremento de tentativa e timestamps", () => {
    const initial: PendingIntent<CreateMissionPayload> = {
      intentId: "intent-1",
      userId: "user-1",
      idempotencyKey: "intent-1",
      type: "CREATE_MISSION",
      payload: { objective: "Test objective" },
      status: "PENDING",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const syncing = transitionIntent(initial, "SYNCING");
    expect(syncing.status).toBe("SYNCING");
    expect(syncing.attempts).toBe(1);
    expect(syncing.lastAttemptAt).toBeDefined();

    const applied = transitionIntent(syncing, "APPLIED", {
      result: { remoteId: "m-123" },
    });
    expect(applied.status).toBe("APPLIED");
    expect(applied.attempts).toBe(1);
    expect(applied.result?.remoteId).toBe("m-123");
  });

  it("deve rejeitar transições inválidas com lançamento de exceção", () => {
    const initial: PendingIntent = {
      intentId: "intent-1",
      userId: "user-1",
      idempotencyKey: "intent-1",
      type: "CREATE_MISSION",
      payload: {},
      status: "PENDING",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(() => transitionIntent(initial, "APPLIED")).toThrow();
  });
});

describe("Marco B — Fila Local Persistida & Isolamento por Usuário", () => {
  beforeEach(() => {
    fakeStore.clear();
  });

  it("A. Offline & Persistência: salva intent localmente com estado PENDING", async () => {
    const intent: PendingIntent<CreateMissionPayload> = {
      intentId: "intent-off-1",
      userId: "user-alice",
      idempotencyKey: "intent-off-1",
      type: "CREATE_MISSION",
      payload: { objective: "Criar relatório offline" },
      status: "PENDING",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await PendingIntentStore.saveIntent(intent);

    // B. Reload: consulta preserva intent intacta
    const saved = await PendingIntentStore.getIntentsByUser("user-alice");
    expect(saved.length).toBe(1);
    expect(saved[0].intentId).toBe("intent-off-1");
    expect(saved[0].status).toBe("PENDING");
  });

  it("G. User Isolation: Usuário A não enxerga nem altera intents do Usuário B", async () => {
    const intentA: PendingIntent = {
      intentId: "intent-a",
      userId: "user-alice",
      idempotencyKey: "intent-a",
      type: "CREATE_MISSION",
      payload: { objective: "Mission Alice" },
      status: "PENDING",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const intentB: PendingIntent = {
      intentId: "intent-b",
      userId: "user-bob",
      idempotencyKey: "intent-b",
      type: "CREATE_MISSION",
      payload: { objective: "Mission Bob" },
      status: "PENDING",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await PendingIntentStore.saveIntent(intentA);
    await PendingIntentStore.saveIntent(intentB);

    const aliceIntents = await PendingIntentStore.getIntentsByUser("user-alice");
    expect(aliceIntents.length).toBe(1);
    expect(aliceIntents[0].intentId).toBe("intent-a");

    const bobIntents = await PendingIntentStore.getIntentsByUser("user-bob");
    expect(bobIntents.length).toBe(1);
    expect(bobIntents[0].intentId).toBe("intent-b");

    // Tentativa de remover intent de Bob como Alice deve falhar
    const removed = await PendingIntentStore.removeIntent("intent-b", "user-alice");
    expect(removed).toBe(false);
    expect(fakeStore.has("intent-b")).toBe(true);
  });
});

describe("Marco B — Reconciliação, Idempotência, Retry & Concorrência", () => {
  beforeEach(() => {
    fakeStore.clear();
    vi.restoreAllMocks();

    vi.stubGlobal("navigator", { onLine: true });

    vi.spyOn(PendingIntentStore, "saveIntent").mockImplementation(async (intent) => {
      fakeStore.set(intent.intentId, { ...intent });
    });

    vi.spyOn(PendingIntentStore, "getIntentsByUser").mockImplementation(async (userId) => {
      return Array.from(fakeStore.values()).filter((i) => i.userId === userId);
    });
  });

  it("C. Reconciliação: PENDING -> SYNCING -> APPLIED quando servidor aceita", async () => {
    const intent: PendingIntent<CreateMissionPayload> = {
      intentId: "intent-rec-1",
      userId: "user-1",
      idempotencyKey: "intent-rec-1",
      type: "CREATE_MISSION",
      payload: { objective: "Reconcile me" },
      status: "PENDING",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await PendingIntentStore.saveIntent(intent);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ mission: { id: "m-remote-1", objective: "Reconcile me" } }),
    } as Response);

    const result = await Reconciler.reconcileUserIntents("user-1");
    expect(result.processed).toBe(1);
    expect(result.applied).toBe(1);

    const updated = await PendingIntentStore.getIntentsByUser("user-1");
    expect(updated[0].status).toBe("APPLIED");
    expect(updated[0].result?.remoteId).toBe("m-remote-1");
  });

  it("D. Idempotência & Envio duplicado: servidor retorna a mesma missão e intent vira APPLIED", async () => {
    const intent: PendingIntent<CreateMissionPayload> = {
      intentId: "intent-dup-1",
      userId: "user-1",
      idempotencyKey: "intent-dup-1",
      type: "CREATE_MISSION",
      payload: { objective: "Duplicate intent test" },
      status: "PENDING",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await PendingIntentStore.saveIntent(intent);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        mission: { id: "m-existing-1", objective: "Duplicate intent test" },
        deduplicated: true,
      }),
    } as Response);

    await Reconciler.reconcileUserIntents("user-1");

    const updated = await PendingIntentStore.getIntentsByUser("user-1");
    expect(updated[0].status).toBe("APPLIED");
    expect(updated[0].result?.remoteId).toBe("m-existing-1");
  });

  it("E. Retry & Backoff Efetivo: FAILED_RETRYABLE recém-falhada não é reenviada imediatamente até cumprir janela de backoff", async () => {
    const intent: PendingIntent<CreateMissionPayload> = {
      intentId: "intent-retry-1",
      userId: "user-1",
      idempotencyKey: "intent-retry-1",
      type: "CREATE_MISSION",
      payload: { objective: "Retry test" },
      status: "PENDING",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await PendingIntentStore.saveIntent(intent);

    // 1a tentativa -> 503 Service Unavailable
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: "Service Temporarily Unavailable" }),
    } as Response);

    const res1 = await Reconciler.reconcileUserIntents("user-1");
    expect(res1.retryableErrors).toBe(1);

    let updated = await PendingIntentStore.getIntentsByUser("user-1");
    expect(updated[0].status).toBe("FAILED_RETRYABLE");
    expect(updated[0].attempts).toBe(1);

    // Tentativa Imediata: deve ser IGNORADA devido à janela de backoff (5s)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ mission: { id: "m-should-not-reach" } }),
    } as Response);

    const resImmediate = await Reconciler.reconcileUserIntents("user-1");
    expect(resImmediate.processed).toBe(0);

    // Simula passagem do tempo (> 5s para tentativa 1)
    fakeStore.set("intent-retry-1", {
      ...updated[0],
      lastAttemptAt: new Date(Date.now() - 6000).toISOString(),
    });

    // 2a tentativa após janela -> 200 Success
    const res2 = await Reconciler.reconcileUserIntents("user-1");
    expect(res2.applied).toBe(1);

    updated = await PendingIntentStore.getIntentsByUser("user-1");
    expect(updated[0].status).toBe("APPLIED");
    expect(updated[0].attempts).toBe(2);
  });

  it("Recuperação de SYNCING Órfão: intent travada em SYNCING é recuperada após timeout (60s)", async () => {
    const orphanTime = new Date(Date.now() - (SYNCING_ORPHAN_TIMEOUT_MS + 1000)).toISOString();
    const orphanIntent: PendingIntent<CreateMissionPayload> = {
      intentId: "intent-orphan-1",
      userId: "user-1",
      idempotencyKey: "intent-orphan-1",
      type: "CREATE_MISSION",
      payload: { objective: "Orphan mission" },
      status: "SYNCING",
      attempts: 1,
      lastAttemptAt: orphanTime,
      createdAt: orphanTime,
      updatedAt: orphanTime,
    };

    await PendingIntentStore.saveIntent(orphanIntent);

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ mission: { id: "m-recovered-orphan" } }),
    } as Response);

    const res = await Reconciler.reconcileUserIntents("user-1");
    expect(res.orphansRecovered).toBe(1);
    expect(res.applied).toBe(1);

    const updated = await PendingIntentStore.getIntentsByUser("user-1");
    expect(updated[0].status).toBe("APPLIED");
  });

  it("F. Permanent Failure: erro 400 define FAILED_PERMANENT sem retentativas infinitas", async () => {
    const intent: PendingIntent<CreateMissionPayload> = {
      intentId: "intent-perm-1",
      userId: "user-1",
      idempotencyKey: "intent-perm-1",
      type: "CREATE_MISSION",
      payload: { objective: "ab" }, // Inválido (min 3 chars)
      status: "PENDING",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await PendingIntentStore.saveIntent(intent);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Objetivo da missão é obrigatório (mín. 3 caracteres)" }),
    } as Response);

    const res1 = await Reconciler.reconcileUserIntents("user-1");
    expect(res1.permanentErrors).toBe(1);

    const updated = await PendingIntentStore.getIntentsByUser("user-1");
    expect(updated[0].status).toBe("FAILED_PERMANENT");
    expect(updated[0].lastError).toContain("mín. 3 caracteres");

    // Tentativas subsequentes não devem re-processar FAILED_PERMANENT
    const res2 = await Reconciler.reconcileUserIntents("user-1");
    expect(res2.processed).toBe(0);
  });

  it("H. Concorrência: reconciliações simultâneas não duplicam envio", async () => {
    const intent: PendingIntent<CreateMissionPayload> = {
      intentId: "intent-concurrent-1",
      userId: "user-1",
      idempotencyKey: "intent-concurrent-1",
      type: "CREATE_MISSION",
      payload: { objective: "Concurrent test" },
      status: "PENDING",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await PendingIntentStore.saveIntent(intent);

    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        ok: true,
        status: 201,
        json: async () => ({ mission: { id: "m-conc" } }),
      } as Response;
    });

    // Duas chamadas simultâneas de reconciliação
    await Promise.all([
      Reconciler.reconcileUserIntents("user-1"),
      Reconciler.reconcileUserIntents("user-1"),
    ]);

    expect(fetchCount).toBe(1);
  });
});
