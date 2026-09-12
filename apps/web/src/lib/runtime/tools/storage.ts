/**
 * Storage Abstraction Layer para Filesystem Tool
 * 
 * Suporta múltiplos backends:
 * - Local filesystem (para desenvolvimento)
 * - In-memory (para serverless/Vercel)
 * - Custom storage (extensível)
 * 
 * Design para ambiente serverless:
 * - Cada execução tem sua própria sandbox isolada
 * - Dados persistidos em memória ou storage externo
 * - Compatível com Vercel/Next.js serverless functions
 */

import { resolve, normalize, sep } from "node:path";

// Tipos de storage disponíveis
export type StorageType = "memory" | "local" | "custom";

// Interface base para implementações de storage
export interface StorageBackend {
  /** Obtém o conteúdo de um arquivo */
  getFile(executionId: string, path: string): Promise<{ content: string; size: number } | null>;
  
  /** Escreve conteúdo em um arquivo */
  writeFile(executionId: string, path: string, content: string): Promise<{ size: number }>;
  
  /** Lista conteúdo de um diretório */
  listDirectory(executionId: string, path: string): Promise<{ name: string; type: "file" | "directory" }[]>;
  
  /** Cria um diretório */
  createDirectory(executionId: string, path: string): Promise<{ created: boolean }>;
  
  /** Verifica status de um caminho */
  statPath(executionId: string, path: string): Promise<{ exists: boolean; type: "file" | "directory" | "missing" }>;
  
  /** Remove um arquivo/diretório (opcional) */
  remove?(executionId: string, path: string): Promise<void>;
}

// Implementação em memória (para serverless)
export class InMemoryStorage implements StorageBackend {
  private store: Map<string, Map<string, { content: string; type: "file" | "directory" }>> = new Map();
  
  private getExecutionStore(executionId: string): Map<string, { content: string; type: "file" | "directory" }> {
    if (!this.store.has(executionId)) {
      this.store.set(executionId, new Map());
    }
    return this.store.get(executionId)!;
  }
  
  private normalizePath(path: string): string {
    // Normaliza o caminho para usar como chave
    let normalized = normalize(path);
    // Remove separadores duplos
    while (normalized.includes(sep + sep)) {
      normalized = normalized.replace(sep + sep, sep);
    }
    // Remove separador inicial se existir
    if (normalized.startsWith(sep)) {
      normalized = normalized.substring(sep.length);
    }
    // Trata "." como caminho vazio (raiz)
    if (normalized === ".") {
      normalized = "";
    }
    return normalized;
  }
  
  private getFullPath(executionId: string, path: string): string {
    return `${executionId}:${this.normalizePath(path)}`;
  }
  
  async getFile(executionId: string, path: string): Promise<{ content: string; size: number } | null> {
    const store = this.getExecutionStore(executionId);
    const normalizedPath = this.normalizePath(path);
    
    const entry = store.get(normalizedPath);
    if (!entry || entry.type !== "file") {
      return null;
    }
    
    return {
      content: entry.content,
      size: Buffer.byteLength(entry.content, "utf-8"),
    };
  }
  
  async writeFile(executionId: string, path: string, content: string): Promise<{ size: number }> {
    const store = this.getExecutionStore(executionId);
    const normalizedPath = this.normalizePath(path);
    
    // Cria diretórios pai automaticamente
    const parts = normalizedPath.split(sep);
    let currentPath = "";
    
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}${sep}${parts[i]}` : parts[i];
      if (!store.has(currentPath)) {
        store.set(currentPath, { content: "", type: "directory" });
      }
    }
    
    // Escreve o arquivo
    store.set(normalizedPath, { content, type: "file" });
    
    return {
      size: Buffer.byteLength(content, "utf-8"),
    };
  }
  
  async listDirectory(executionId: string, path: string): Promise<{ name: string; type: "file" | "directory" }[]> {
    const store = this.getExecutionStore(executionId);
    const normalizedPath = this.normalizePath(path);
    
    // Verifica se o caminho existe e é um diretório
    const entry = store.get(normalizedPath);
    if (entry && entry.type !== "directory") {
      // Se existir mas não for diretório, erro
      throw new Error("NOT_A_DIRECTORY");
    }
    
    // Se não existir, só permite se for a raiz (normalizedPath === "")
    if (!entry && normalizedPath !== "") {
      throw new Error("NOT_A_DIRECTORY");
    }
    
    const prefix = normalizedPath ? `${normalizedPath}${sep}` : "";
    const entries: { name: string; type: "file" | "directory" }[] = [];
    
    for (const [key, value] of store.entries()) {
      if (key.startsWith(prefix)) {
        const remaining = key.substring(prefix.length);
        const firstPart = remaining.split(sep)[0];
        
        // Só inclui entradas diretas (não recursivas)
        if (!remaining.includes(sep) || firstPart === remaining) {
          const existing = entries.find(e => e.name === firstPart);
          if (!existing) {
            entries.push({
              name: firstPart,
              type: value.type,
            });
          }
        }
      }
    }
    
    return entries;
  }
  
  async createDirectory(executionId: string, path: string): Promise<{ created: boolean }> {
    const store = this.getExecutionStore(executionId);
    const normalizedPath = this.normalizePath(path);
    
    const existing = store.get(normalizedPath);
    if (existing) {
      if (existing.type !== "directory") {
        throw new Error("NOT_A_DIRECTORY");
      }
      return { created: false };
    }
    
    // Cria o diretório
    store.set(normalizedPath, { content: "", type: "directory" });
    
    return { created: true };
  }
  
  async statPath(executionId: string, path: string): Promise<{ exists: boolean; type: "file" | "directory" | "missing" }> {
    const store = this.getExecutionStore(executionId);
    const normalizedPath = this.normalizePath(path);
    
    // A raiz (caminho vazio) sempre existe como diretório
    if (normalizedPath === "") {
      return { exists: true, type: "directory" };
    }
    
    const entry = store.get(normalizedPath);
    if (!entry) {
      return { exists: false, type: "missing" };
    }
    
    return {
      exists: true,
      type: entry.type,
    };
  }
  
  async remove(executionId: string, path: string): Promise<void> {
    const store = this.getExecutionStore(executionId);
    const normalizedPath = this.normalizePath(path);
    store.delete(normalizedPath);
  }
  
  /** Limpa dados de uma execução */
  clearExecution(executionId: string): void {
    this.store.delete(executionId);
  }
  
  /** Limpa todo o storage (para testes) */
  clearAll(): void {
    this.store.clear();
  }
}

// Implementação local (para desenvolvimento)
export class LocalFilesystemStorage implements StorageBackend {
  private basePath: string;
  private executionPrefix: string;
  
  constructor(basePath: string = "apps/web/sandbox", executionPrefix: string = "exec") {
    this.basePath = resolve(process.cwd(), basePath);
    this.executionPrefix = executionPrefix;
  }
  
  private getExecutionPath(executionId: string): string {
    return resolve(this.basePath, this.executionPrefix, executionId);
  }
  
  private async ensureExecutionPath(executionId: string): Promise<string> {
    const { mkdir } = await import("node:fs/promises");
    const path = this.getExecutionPath(executionId);
    await mkdir(path, { recursive: true });
    return path;
  }
  
  private sanitizePath(path: string): string {
    // Remove qualquer tentativa de traversal
    const normalized = normalize(path);
    if (normalized.startsWith("..") || normalized.includes(sep + ".." + sep)) {
      throw new Error("PATH_TRAVERSAL");
    }
    return normalized;
  }
  
  async getFile(executionId: string, path: string): Promise<{ content: string; size: number } | null> {
    const { readFile } = await import("node:fs/promises");
    const { stat } = await import("node:fs/promises");
    
    const sanitizedPath = this.sanitizePath(path);
    const fullPath = resolve(this.getExecutionPath(executionId), sanitizedPath);
    
    try {
      const fileStat = await stat(fullPath);
      if (!fileStat.isFile()) {
        return null;
      }
      
      const content = await readFile(fullPath, "utf-8");
      return {
        content,
        size: fileStat.size,
      };
    } catch {
      return null;
    }
  }
  
  async writeFile(executionId: string, path: string, content: string): Promise<{ size: number }> {
    const { writeFile } = await import("node:fs/promises");
    const { mkdir } = await import("node:fs/promises");
    
    const sanitizedPath = this.sanitizePath(path);
    const fullPath = resolve(this.getExecutionPath(executionId), sanitizedPath);
    
    // Cria diretórios pai
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf(sep));
    await mkdir(dirPath, { recursive: true });
    
    await writeFile(fullPath, content, "utf-8");
    
    return {
      size: Buffer.byteLength(content, "utf-8"),
    };
  }
  
  async listDirectory(executionId: string, path: string): Promise<{ name: string; type: "file" | "directory" }[]> {
    const { readdir } = await import("node:fs/promises");
    const { stat } = await import("node:fs/promises");
    
    const sanitizedPath = this.sanitizePath(path);
    const fullPath = resolve(this.getExecutionPath(executionId), sanitizedPath);
    
    try {
      const entries = await readdir(fullPath);
      const result: { name: string; type: "file" | "directory" }[] = [];
      
      for (const entry of entries) {
        const entryPath = resolve(fullPath, entry);
        const entryStat = await stat(entryPath);
        result.push({
          name: entry,
          type: entryStat.isDirectory() ? "directory" : "file",
        });
      }
      
      return result;
    } catch {
      // If directory doesn't exist or is not a directory, check if it's the root
      // For root path, return empty array
      if (sanitizedPath === "." || sanitizedPath === "") {
        return [];
      }
      throw new Error("NOT_A_DIRECTORY");
    }
  }
  
  async createDirectory(executionId: string, path: string): Promise<{ created: boolean }> {
    const { mkdir } = await import("node:fs/promises");
    const { stat } = await import("node:fs/promises");
    
    const sanitizedPath = this.sanitizePath(path);
    const fullPath = resolve(this.getExecutionPath(executionId), sanitizedPath);
    
    try {
      const existing = await stat(fullPath);
      if (existing.isDirectory()) {
        return { created: false };
      }
      throw new Error("NOT_A_DIRECTORY");
    } catch (e: unknown) {
      const error = e as Error & { code?: string };
      if (error.code === "ENOENT") {
        await mkdir(fullPath, { recursive: true });
        return { created: true };
      }
      throw e;
    }
  }
  
  async statPath(executionId: string, path: string): Promise<{ exists: boolean; type: "file" | "directory" | "missing" }> {
    const { stat } = await import("node:fs/promises");
    
    const sanitizedPath = this.sanitizePath(path);
    const fullPath = resolve(this.getExecutionPath(executionId), sanitizedPath);
    
    try {
      const fileStat = await stat(fullPath);
      return {
        exists: true,
        type: fileStat.isDirectory() ? "directory" : "file",
      };
    } catch {
      // If path is empty (root), the execution directory always exists
      if (sanitizedPath === "") {
        return { exists: true, type: "directory" };
      }
      return { exists: false, type: "missing" };
    }
  }
}

// Storage global (singleton)
let globalStorage: StorageBackend;

/**
 * Obtém o backend de storage configurado
 */
export function getStorageBackend(): StorageBackend {
  if (!globalStorage) {
    // Default: InMemoryStorage para serverless
    // Para desenvolvimento local, pode ser configurado via setStorageBackend
    const storageType = process.env.FILESYSTEM_STORAGE_TYPE as StorageType || "memory";
    
    if (storageType === "local") {
      const basePath = process.env.FILESYSTEM_STORAGE_LOCAL_PATH || "apps/web/sandbox";
      globalStorage = new LocalFilesystemStorage(basePath);
    } else {
      globalStorage = new InMemoryStorage();
    }
  }
  return globalStorage;
}

/**
 * Configura o backend de storage global
 */
export function setStorageBackend(backend: StorageBackend): void {
  globalStorage = backend;
}

/**
 * Reseta o storage (para testes)
 */
export function resetStorage(): void {
  if (globalStorage instanceof InMemoryStorage) {
    globalStorage.clearAll();
  }
  globalStorage = null as unknown as StorageBackend;
}

// Tipos de entrada para o storage
export type StorageListInput = { path: string };
export type StorageReadInput = { path: string };
export type StorageWriteInput = { path: string; content: string };
export type StorageMkdirInput = { path: string };
export type StorageStatInput = { path: string };

// Funções de conveniência que usam o backend global
export async function storageList(executionId: string, input: StorageListInput) {
  return getStorageBackend().listDirectory(executionId, input.path);
}

export async function storageRead(executionId: string, input: StorageReadInput) {
  return getStorageBackend().getFile(executionId, input.path);
}

export async function storageWrite(executionId: string, input: StorageWriteInput) {
  return getStorageBackend().writeFile(executionId, input.path, input.content);
}

export async function storageMkdir(executionId: string, input: StorageMkdirInput) {
  return getStorageBackend().createDirectory(executionId, input.path);
}

export async function storageStat(executionId: string, input: StorageStatInput) {
  return getStorageBackend().statPath(executionId, input.path);
}
