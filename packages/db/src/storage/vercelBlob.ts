/**
 * Vercel Blob Storage Backend
 * 
 * Implementa a interface StorageBackend para persistência na Vercel.
 * Usa @vercel/blob para armazenamento durável em ambientes serverless.
 * 
 * Design:
 * - Cada execution tem sua própria sandbox isolada (prefixo: executionId)
 * - Caminhos são normalizados e sanitizados
 * - Compatível com o Storage Abstraction Layer existente
 */

import { sep } from "node:path";
import { put, head, list, del } from "@vercel/blob";

// Prefixo para isolamento de execuções
const EXECUTION_PREFIX = "exec";

// Interface StorageBackend (replicada aqui para evitar dependência circular)
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

/**
 * Vercel Blob Storage Implementation
 * 
 * Armazena arquivos no Vercel Blob com isolamento por executionId.
 * Todos os caminhos são prefixados com executionId para evitar conflitos.
 */
export class VercelBlobStorage implements StorageBackend {
  
  /**
   * Normaliza o caminho para uso como chave no Blob Storage
   */
  private normalizePath(path: string): string {
    let normalized = path.replace(/\\/g, sep);
    
    // Remove separadores duplos
    while (normalized.includes(sep + sep)) {
      normalized = normalized.replace(sep + sep, sep);
    }
    
    // Remove separador inicial
    if (normalized.startsWith(sep)) {
      normalized = normalized.substring(sep.length);
    }
    
    // Trata "." como vazio (raiz)
    if (normalized === ".") {
      normalized = "";
    }
    
    return normalized;
  }
  
  /**
   * Obtém a chave completa para o Blob Storage
   */
  private getBlobKey(executionId: string, path: string): string {
    const normalizedPath = this.normalizePath(path);
    // Usa / como separador para o Blob Storage (não usa sep do OS)
    const safePath = normalizedPath.replace(/\\/g, "/");
    return `${EXECUTION_PREFIX}/${executionId}/${safePath}`;
  }
  
  /**
   * Obtém o conteúdo de um arquivo
   */
  async getFile(executionId: string, path: string): Promise<{ content: string; size: number } | null> {
    const key = this.getBlobKey(executionId, path);
    
    try {
      const metadata = await head(key);
      if (!metadata) {
        return null;
      }
      
      // Fetch o conteúdo do blob usando a URL
      const response = await fetch(metadata.url);
      if (!response.ok) {
        return null;
      }
      
      const content = await response.text();
      return {
        content,
        size: new Blob([content]).size,
      };
    } catch {
      return null;
    }
  }
  
  /**
   * Escreve conteúdo em um arquivo
   */
  async writeFile(executionId: string, path: string, content: string): Promise<{ size: number }> {
    const key = this.getBlobKey(executionId, path);
    
    // Cria um Blob com o conteúdo
    const blob = new Blob([content], { type: "text/plain" });
    
    // Upload para o Vercel Blob
    await put(key, blob, {
      access: "public",
      addRandomSuffix: false,
    });
    
    return {
      size: blob.size,
    };
  }
  
  /**
   * Lista conteúdo de um diretório
   * 
   * NOTE: Vercel Blob não tem diretórios nativamente, então simulamos
   * listando todas as chaves com o prefixo e filtrando.
   */
  async listDirectory(executionId: string, path: string): Promise<{ name: string; type: "file" | "directory" }[]> {
    const normalizedPath = this.normalizePath(path);
    const prefix = `${EXECUTION_PREFIX}/${executionId}/${normalizedPath.replace(/\\/g, "/")}`;
    
    try {
      const { blobs } = await list({ prefix });
      
      // Extrair nomes únicos dos blobs (primeiro nível)
      const entries: { name: string; type: "file" | "directory" }[] = [];
      const seenNames = new Set<string>();
      
      for (const blob of blobs) {
        const key = blob.pathname;
        // Remover o prefixo da execução
        const relativePath = key.replace(`${EXECUTION_PREFIX}/${executionId}/`, "");
        
        // Se o path solicitado não for vazio, remover também
        const pathPrefix = normalizedPath ? `${normalizedPath.replace(/\\/g, "/")}/` : "";
        const remainingPath = relativePath.replace(pathPrefix, "");
        
        // Obter o primeiro componente do caminho restante
        const firstPart = remainingPath.split("/")[0];
        
        if (firstPart && !seenNames.has(firstPart)) {
          // Verificar se existe um blob que é um "diretório" (tem / no nome)
          // Para simplificar, assumimos que é file se não tiver mais partes
          const isDirectory = blobs.some(b => 
            b.pathname.startsWith(`${prefix}/${firstPart}/`)
          );
          
          entries.push({
            name: firstPart,
            type: isDirectory ? "directory" : "file",
          });
          seenNames.add(firstPart);
        }
      }
      
      return entries;
    } catch {
      // Se o prefixo não existir, retornar array vazio (para a raiz)
      if (normalizedPath === "" || normalizedPath === ".") {
        return [];
      }
      throw new Error("NOT_A_DIRECTORY");
    }
  }
  
  /**
   * Cria um diretório
   * 
   * NOTE: No Vercel Blob, diretórios são implícitos. 
   * Esta função é um no-op, mas mantemos para compatibilidade com a interface.
   */
  async createDirectory(executionId: string, path: string): Promise<{ created: boolean }> {
    const normalizedPath = this.normalizePath(path);
    
    // No Blob Storage, diretórios são criados implicitamente ao criar arquivos
    // Verificar se já existe algum arquivo no caminho
    const prefix = `${EXECUTION_PREFIX}/${executionId}/${normalizedPath.replace(/\\/g, "/")}`;
    
    try {
      const { blobs } = await list({ prefix, limit: 1 });
      // Se já existir arquivos, o "diretório" já existe
      if (blobs.length > 0) {
        return { created: false };
      }
      
      // Criar um marcador de diretório (arquivo vazio com sufixo especial)
      // Isso é opcional, mas pode ajudar na listagem
      return { created: true };
    } catch {
      // Se não existir nada, consideramos que o diretório pode ser criado
      return { created: true };
    }
  }
  
  /**
   * Verifica status de um caminho
   */
  async statPath(executionId: string, path: string): Promise<{ exists: boolean; type: "file" | "directory" | "missing" }> {
    const normalizedPath = this.normalizePath(path);
    
    // A raiz sempre existe como diretório
    if (normalizedPath === "") {
      return { exists: true, type: "directory" };
    }
    
    const key = this.getBlobKey(executionId, path);
    
    try {
      const metadata = await head(key);
      if (metadata) {
        return { exists: true, type: "file" };
      }
    } catch {
      // Blob não encontrado
    }
    
    // Verificar se existe como "diretório" (qualquer blob com este prefixo)
    const prefix = `${EXECUTION_PREFIX}/${executionId}/${normalizedPath.replace(/\\/g, "/")}/`;
    
    try {
      const { blobs } = await list({ prefix, limit: 1 });
      if (blobs.length > 0) {
        return { exists: true, type: "directory" };
      }
    } catch {
      // Nenhum blob encontrado
    }
    
    return { exists: false, type: "missing" };
  }
  
  /**
   * Remove um arquivo ou diretório
   * 
   * NOTE: Para diretórios, remove todos os arquivos com o prefixo.
   */
  async remove(executionId: string, path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const key = this.getBlobKey(executionId, path);
    
    try {
      // Tentar remover como arquivo
      await del(key);
    } catch {
      // Se não for arquivo, tentar como diretório (remover todos com prefixo)
      const prefix = `${EXECUTION_PREFIX}/${executionId}/${normalizedPath.replace(/\\/g, "/")}`;
      const { blobs } = await list({ prefix });
      
      for (const blob of blobs) {
        await del(blob.pathname);
      }
    }
  }
  
  /**
   * Limpa todos os dados de uma execução
   */
  async clearExecution(executionId: string): Promise<void> {
    const prefix = `${EXECUTION_PREFIX}/${executionId}/`;
    
    try {
      const { blobs } = await list({ prefix });
      
      for (const blob of blobs) {
        await del(blob.pathname);
      }
    } catch {
      // Se não houver blobs, ignorar
    }
  }
}

/**
 * Cria uma instância do VercelBlobStorage
 */
export function createVercelBlobStorage(): VercelBlobStorage {
  return new VercelBlobStorage();
}
