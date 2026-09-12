/**
 * Filesystem Tool V2 - Compatível com Serverless
 * 
 * Usa Storage Abstraction Layer para suportar:
 * - Local filesystem (desenvolvimento)
 * - In-memory storage (Vercel/serverless)
 * - Custom backends
 * 
 * Todas as operações são isoladas por executionId
 */

import { sep } from "node:path";
import {
  storageList,
  storageRead,
  storageWrite,
  storageMkdir,
  storageStat,
} from "./storage";
import { SandboxSecurityError, SandboxErrorCode } from "./sandbox";
import type { ToolResult } from "./types";

// Limite de tamanho para leitura/escrita de arquivos (1MB para V1)
export const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// Tipos de entrada para as operações do filesystem
export type FilesystemListInput = {
  path: string;
};

export type FilesystemReadInput = {
  path: string;
};

export type FilesystemWriteInput = {
  path: string;
  content: string;
};

export type FilesystemMkdirInput = {
  path: string;
};

export type FilesystemStatInput = {
  path: string;
};

// Tipos de saída
export type FilesystemEntry = {
  name: string;
  type: "file" | "directory";
};

export type FilesystemListOutput = {
  entries: FilesystemEntry[];
};

export type FilesystemReadOutput = {
  path: string;
  content: string;
  size: number;
};

export type FilesystemWriteOutput = {
  path: string;
  size: number;
};

export type FilesystemMkdirOutput = {
  path: string;
  created: boolean;
};

export type FilesystemStatOutput = {
  path: string;
  exists: boolean;
  type: "file" | "directory" | "missing";
};

// Tipos de input genérico para o dispatcher
export type FilesystemToolInput = 
  | { action: "list"; payload: FilesystemListInput }
  | { action: "read"; payload: FilesystemReadInput }
  | { action: "write"; payload: FilesystemWriteInput }
  | { action: "mkdir"; payload: FilesystemMkdirInput }
  | { action: "stat"; payload: FilesystemStatInput };

/**
 * Validação de caminho para prevenir path traversal
 */
function validatePath(inputPath: string): string {
  if (typeof inputPath !== "string") {
    throw new SandboxSecurityError("INVALID_INPUT", "Caminho inválido");
  }

  // Normaliza o caminho (resolve .., ., etc)
  const normalizedPath = inputPath.replace(/\\/g, sep);

  // Permite "." e "" como caminho válido (raiz)
  if (normalizedPath === "." || normalizedPath === "") {
    return "";
  }

  // Rejeita caminhos absolutos diretos
  if (normalizedPath.startsWith(sep)) {
    throw new SandboxSecurityError("PATH_OUTSIDE_SANDBOX", "Caminhos absolutos não são permitidos");
  }

  // Rejeita tentativas óbvias de traversal
  if (normalizedPath.includes(`..${sep}`) || normalizedPath === ".." || normalizedPath.startsWith(`..${sep}`)) {
    throw new SandboxSecurityError("PATH_TRAVERSAL", "Tentativa de path traversal detectada");
  }

  return normalizedPath;
}

/**
 * Lista o conteúdo de um diretório
 */
async function listDirectory(
  executionId: string,
  input: FilesystemListInput
): Promise<FilesystemListOutput> {
  const normalizedPath = validatePath(input.path);
  
  const result = await storageList(executionId, { path: normalizedPath });
  
  return { 
    entries: result.map(e => ({
      name: e.name,
      type: e.type,
    })),
  };
}

/**
 * Lê o conteúdo de um arquivo de texto
 */
async function readFileContent(
  executionId: string,
  input: FilesystemReadInput
): Promise<FilesystemReadOutput> {
  const normalizedPath = validatePath(input.path);

  const result = await storageRead(executionId, { path: normalizedPath });
  
  if (!result) {
    throw new SandboxSecurityError("FILE_NOT_FOUND", `Arquivo não encontrado: ${input.path}`);
  }

  // Verifica limite de tamanho
  if (result.size > MAX_FILE_SIZE) {
    throw new SandboxSecurityError("FILE_TOO_LARGE", `Arquivo excede limite de ${MAX_FILE_SIZE} bytes`);
  }

  return {
    path: input.path,
    content: result.content,
    size: result.size,
  };
}

/**
 * Escreve conteúdo em um arquivo
 */
async function writeFileContent(
  executionId: string,
  input: FilesystemWriteInput
): Promise<FilesystemWriteOutput> {
  const normalizedPath = validatePath(input.path);

  // Verifica limite de tamanho do conteúdo
  const contentSize = Buffer.byteLength(input.content, "utf-8");
  if (contentSize > MAX_FILE_SIZE) {
    throw new SandboxSecurityError("WRITE_TOO_LARGE", `Conteúdo excede limite de ${MAX_FILE_SIZE} bytes`);
  }

  const result = await storageWrite(executionId, { 
    path: normalizedPath,
    content: input.content,
  });

  return {
    path: input.path,
    size: result.size,
  };
}

/**
 * Cria um diretório
 */
async function makeDirectory(
  executionId: string,
  input: FilesystemMkdirInput
): Promise<FilesystemMkdirOutput> {
  const normalizedPath = validatePath(input.path);

  const result = await storageMkdir(executionId, { path: normalizedPath });

  return {
    path: input.path,
    created: result.created,
  };
}

/**
 * Verifica status de um caminho
 */
async function statPath(
  executionId: string,
  input: FilesystemStatInput
): Promise<FilesystemStatOutput> {
  const normalizedPath = validatePath(input.path);

  const result = await storageStat(executionId, { path: normalizedPath });

  return {
    path: input.path,
    exists: result.exists,
    type: result.type,
  };
}

/**
 * Executa uma operação do filesystem tool
 * 
 * NOTE: Esta função agora recebe executionId para isolamento por execução
 */
export async function runFilesystem(
  input: string,
  executionId?: string
): Promise<ToolResult> {
  const start = Date.now();
  
  // Se não tiver executionId, usa um default para compatibilidade
  const effectiveExecutionId = executionId || "default";
  
  try {
    // Parse do input JSON
    let parsedInput: FilesystemToolInput;
    try {
      parsedInput = JSON.parse(input) as FilesystemToolInput;
    } catch {
      return {
        ok: false,
        tool: "filesystem",
        input,
        error: "INVALID_INPUT",
        durationMs: Date.now() - start,
      };
    }

    // Validação básica
    if (!parsedInput || !parsedInput.action) {
      return {
        ok: false,
        tool: "filesystem",
        input,
        error: "INVALID_INPUT",
        durationMs: Date.now() - start,
      };
    }

    const action = parsedInput.action;
    const payload = parsedInput.payload;

    switch (action) {
      case "list": {
        const result = await listDirectory(effectiveExecutionId, payload as FilesystemListInput);
        return {
          ok: true,
          tool: "filesystem",
          input,
          output: JSON.stringify(result),
          durationMs: Date.now() - start,
        };
      }

      case "read": {
        const result = await readFileContent(effectiveExecutionId, payload as FilesystemReadInput);
        return {
          ok: true,
          tool: "filesystem",
          input,
          output: JSON.stringify(result),
          durationMs: Date.now() - start,
        };
      }

      case "write": {
        const result = await writeFileContent(effectiveExecutionId, payload as FilesystemWriteInput);
        return {
          ok: true,
          tool: "filesystem",
          input,
          output: JSON.stringify(result),
          durationMs: Date.now() - start,
        };
      }

      case "mkdir": {
        const result = await makeDirectory(effectiveExecutionId, payload as FilesystemMkdirInput);
        return {
          ok: true,
          tool: "filesystem",
          input,
          output: JSON.stringify(result),
          durationMs: Date.now() - start,
        };
      }

      case "stat": {
        const result = await statPath(effectiveExecutionId, payload as FilesystemStatInput);
        return {
          ok: true,
          tool: "filesystem",
          input,
          output: JSON.stringify(result),
          durationMs: Date.now() - start,
        };
      }

      default:
        return {
          ok: false,
          tool: "filesystem",
          input,
          error: "UNSUPPORTED_OPERATION",
          durationMs: Date.now() - start,
        };
    }
  } catch (error) {
    // Trata erros da sandbox
    if (error instanceof SandboxSecurityError) {
      return {
        ok: false,
        tool: "filesystem",
        input,
        error: error.code,
        durationMs: Date.now() - start,
      };
    }

    // Erro desconhecido
    return {
      ok: false,
      tool: "filesystem",
      input,
      error: "PERMISSION_DENIED",
      durationMs: Date.now() - start,
    };
  }
}

// Funções de conveniência para chamadas diretas (para testes)
export async function filesystemList(path: string, executionId?: string): Promise<FilesystemListOutput> {
  const result = await runFilesystem(JSON.stringify({ action: "list", payload: { path } }), executionId);
  if (!result.ok) {
    throw new SandboxSecurityError(result.error as SandboxErrorCode, result.error);
  }
  return JSON.parse(result.output) as FilesystemListOutput;
}

export async function filesystemRead(path: string, executionId?: string): Promise<FilesystemReadOutput> {
  const result = await runFilesystem(JSON.stringify({ action: "read", payload: { path } }), executionId);
  if (!result.ok) {
    throw new SandboxSecurityError(result.error as SandboxErrorCode, result.error);
  }
  return JSON.parse(result.output) as FilesystemReadOutput;
}

export async function filesystemWrite(path: string, content: string, executionId?: string): Promise<FilesystemWriteOutput> {
  const result = await runFilesystem(JSON.stringify({ action: "write", payload: { path, content } }), executionId);
  if (!result.ok) {
    throw new SandboxSecurityError(result.error as SandboxErrorCode, result.error);
  }
  return JSON.parse(result.output) as FilesystemWriteOutput;
}

export async function filesystemMkdir(path: string, executionId?: string): Promise<FilesystemMkdirOutput> {
  const result = await runFilesystem(JSON.stringify({ action: "mkdir", payload: { path } }), executionId);
  if (!result.ok) {
    throw new SandboxSecurityError(result.error as SandboxErrorCode, result.error);
  }
  return JSON.parse(result.output) as FilesystemMkdirOutput;
}

export async function filesystemStat(path: string, executionId?: string): Promise<FilesystemStatOutput> {
  const result = await runFilesystem(JSON.stringify({ action: "stat", payload: { path } }), executionId);
  if (!result.ok) {
    throw new SandboxSecurityError(result.error as SandboxErrorCode, result.error);
  }
  return JSON.parse(result.output) as FilesystemStatOutput;
}

// Exporta tipos para compatibilidade
export type { SandboxSecurityError, SandboxErrorCode } from "./sandbox";
