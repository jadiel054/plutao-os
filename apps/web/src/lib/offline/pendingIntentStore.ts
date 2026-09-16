/**
 * @plutao/web — PendingIntentStore
 * IndexedDB abstraction for client-side persistent storage of PendingIntents.
 * Aligned with Marco B: Fila local persistida + Segurança / Isolamento por usuário.
 */

import { PendingIntent } from "@plutao/domain";

const DB_NAME = "plutao_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "pending_intents";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB não disponível no ambiente atual"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "intentId" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("userId_status", ["userId", "status"], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class PendingIntentStore {
  /**
   * Salva ou atualiza uma intent no IndexedDB.
   */
  static async saveIntent<T>(intent: PendingIntent<T>): Promise<void> {
    if (!intent.userId) {
      throw new Error("userId é obrigatório para salvar PendingIntent");
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(intent);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retorna todas as intents de um usuário específico (isolamento estrito por userId).
   */
  static async getIntentsByUser<T = unknown>(userId: string): Promise<PendingIntent<T>[]> {
    if (!userId) return [];
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("userId");
      const request = index.getAll(IDBKeyRange.only(userId));

      request.onsuccess = () => {
        const results = (request.result as PendingIntent<T>[]) || [];
        // Ordena por data de criação (mais antigas primeiro)
        results.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Obtém uma intent por intentId garantindo que pertence ao userId.
   */
  static async getIntentById<T = unknown>(
    intentId: string,
    userId: string
  ): Promise<PendingIntent<T> | null> {
    if (!userId || !intentId) return null;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(intentId);

      request.onsuccess = () => {
        const intent = request.result as PendingIntent<T> | undefined;
        if (intent && intent.userId === userId) {
          resolve(intent);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove uma intent por intentId garantindo validação de userId.
   */
  static async removeIntent(intentId: string, userId: string): Promise<boolean> {
    if (!intentId || !userId) return false;
    const existing = await this.getIntentById(intentId, userId);
    if (!existing) return false;

    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(intentId);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Limpa intents em estado APPLIED para um determinado usuário.
   */
  static async clearAppliedIntents(userId: string): Promise<number> {
    if (!userId) return 0;
    const intents = await this.getIntentsByUser(userId);
    const applied = intents.filter((i) => i.status === "APPLIED");
    let removed = 0;
    for (const intent of applied) {
      const deleted = await this.removeIntent(intent.intentId, userId);
      if (deleted) removed++;
    }
    return removed;
  }
}
