export * from "./schema";
export { createDb, checkDatabaseConnection, type Db } from "./client";

// Storage Abstraction - import and re-export StorageBackend type
import type { StorageBackend } from "./storage/vercelBlob.ts";
import { VercelBlobStorage, createVercelBlobStorage } from "./storage/vercelBlob.ts";
export type { StorageBackend };
export { VercelBlobStorage, createVercelBlobStorage };

// Storage Mode Types
export type StorageMode = "memory" | "vercel-blob";

// Função para obter o backend de storage com base no modo configurado
export function getStorageBackend(mode?: StorageMode): StorageBackend {
  const storageMode = mode || (process.env.STORAGE_MODE as StorageMode) || "memory";
  
  if (storageMode === "vercel-blob") {
    return createVercelBlobStorage();
  }
  
  // Default: memory (para desenvolvimento local)
  // Import dinâmico para evitar dependência circular
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const { InMemoryStorage } = require("../../../apps/web/src/lib/runtime/tools/storage");
  return new InMemoryStorage();
}
