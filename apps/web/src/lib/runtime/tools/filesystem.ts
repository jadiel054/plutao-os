import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { sep } from "node:path";
import {
  resolveSandboxPath,
  isFile,
  isDirectory,
  exists,
  MAX_FILE_SIZE,
  SandboxSecurityError,
} from "./sandbox";
import type { ToolResult } from "./types";

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
 * Lista o conteúdo de um diretório dentro da sandbox
 */
async function listDirectory(input: FilesystemListInput): Promise<FilesystemListOutput> {
  const resolvedPath = await resolveSandboxPath(input.path);
  
  if (!(await isDirectory(resolvedPath))) {
    throw new SandboxSecurityError("NOT_A_DIRECTORY", `Caminho não é um diretório: ${input.path}`);
  }

  const entries = await readdir(resolvedPath);
  const result: FilesystemEntry[] = [];

  for (const entry of entries) {
    const fullPath = `${resolvedPath}${sep}${entry}`;
    const isDir = await isDirectory(fullPath);
    result.push({
      name: entry,
      type: isDir ? "directory" : "file",
    });
  }

  return { entries: result };
}

/**
 * Lê o conteúdo de um arquivo de texto dentro da sandbox
 */
async function readFileContent(input: FilesystemReadInput): Promise<FilesystemReadOutput> {
  const resolvedPath = await resolveSandboxPath(input.path);
  
  if (!(await isFile(resolvedPath))) {
    throw new SandboxSecurityError("NOT_A_FILE", `Caminho não é um arquivo: ${input.path}`);
  }

  const stats = await (await import("node:fs/promises")).stat(resolvedPath);
  if (stats.size > MAX_FILE_SIZE) {
    throw new SandboxSecurityError("FILE_TOO_LARGE", `Arquivo excede limite de ${MAX_FILE_SIZE} bytes`);
  }

  const content = await readFile(resolvedPath, "utf-8");
  
  return {
    path: input.path,
    content,
    size: stats.size,
  };
}

/**
 * Escreve conteúdo em um arquivo dentro da sandbox
 */
async function writeFileContent(input: FilesystemWriteInput): Promise<FilesystemWriteOutput> {
  const resolvedPath = await resolveSandboxPath(input.path);
  
  // Verifica limite de tamanho do conteúdo
  const contentSize = Buffer.byteLength(input.content, "utf-8");
  if (contentSize > MAX_FILE_SIZE) {
    throw new SandboxSecurityError("WRITE_TOO_LARGE", `Conteúdo excede limite de ${MAX_FILE_SIZE} bytes`);
  }

  // Cria diretórios pai se não existirem
  const dirPath = resolvedPath.substring(0, resolvedPath.lastIndexOf(sep));
  if (dirPath && !(await exists(dirPath))) {
    await mkdir(dirPath, { recursive: true });
  }

  await writeFile(resolvedPath, input.content, "utf-8");
  
  return {
    path: input.path,
    size: contentSize,
  };
}

/**
 * Cria um diretório dentro da sandbox
 */
async function makeDirectory(input: FilesystemMkdirInput): Promise<FilesystemMkdirOutput> {
  const resolvedPath = await resolveSandboxPath(input.path);
  
  // Verifica se já existe
  const alreadyExists = await exists(resolvedPath);
  
  if (alreadyExists) {
    if (!(await isDirectory(resolvedPath))) {
      throw new SandboxSecurityError("NOT_A_DIRECTORY", `Caminho existe mas não é um diretório: ${input.path}`);
    }
    // Idempotente: já existe como diretório
    return { path: input.path, created: false };
  }

  await mkdir(resolvedPath, { recursive: true });
  
  return {
    path: input.path,
    created: true,
  };
}

/**
 * Verifica status de um caminho dentro da sandbox
 */
async function statPath(input: FilesystemStatInput): Promise<FilesystemStatOutput> {
  const resolvedPath = await resolveSandboxPath(input.path);
  
  const existsFlag = await exists(resolvedPath);
  
  if (!existsFlag) {
    return {
      path: input.path,
      exists: false,
      type: "missing",
    };
  }

  if (await isDirectory(resolvedPath)) {
    return {
      path: input.path,
      exists: true,
      type: "directory",
    };
  }

  if (await isFile(resolvedPath)) {
    return {
      path: input.path,
      exists: true,
      type: "file",
    };
  }

  // Outro tipo de arquivo (symlink, etc)
  return {
    path: input.path,
    exists: true,
    type: "missing",
  };
}

/**
 * Executa uma operação do filesystem tool
 */
export async function runFilesystem(input: string): Promise<ToolResult> {
  const start = Date.now();
  
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
        const result = await listDirectory(payload as FilesystemListInput);
        return {
          ok: true,
          tool: "filesystem",
          input,
          output: JSON.stringify(result),
          durationMs: Date.now() - start,
        };
      }

      case "read": {
        const result = await readFileContent(payload as FilesystemReadInput);
        return {
          ok: true,
          tool: "filesystem",
          input,
          output: JSON.stringify(result),
          durationMs: Date.now() - start,
        };
      }

      case "write": {
        const result = await writeFileContent(payload as FilesystemWriteInput);
        return {
          ok: true,
          tool: "filesystem",
          input,
          output: JSON.stringify(result),
          durationMs: Date.now() - start,
        };
      }

      case "mkdir": {
        const result = await makeDirectory(payload as FilesystemMkdirInput);
        return {
          ok: true,
          tool: "filesystem",
          input,
          output: JSON.stringify(result),
          durationMs: Date.now() - start,
        };
      }

      case "stat": {
        const result = await statPath(payload as FilesystemStatInput);
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
export async function filesystemList(path: string): Promise<FilesystemListOutput> {
  const result = await runFilesystem(JSON.stringify({ action: "list", payload: { path } }));
  if (!result.ok) {
    throw new SandboxSecurityError(result.error as SandboxErrorCode, result.error);
  }
  return JSON.parse(result.output) as FilesystemListOutput;
}

export async function filesystemRead(path: string): Promise<FilesystemReadOutput> {
  const result = await runFilesystem(JSON.stringify({ action: "read", payload: { path } }));
  if (!result.ok) {
    throw new SandboxSecurityError(result.error as SandboxErrorCode, result.error);
  }
  return JSON.parse(result.output) as FilesystemReadOutput;
}

export async function filesystemWrite(path: string, content: string): Promise<FilesystemWriteOutput> {
  const result = await runFilesystem(JSON.stringify({ action: "write", payload: { path, content } }));
  if (!result.ok) {
    throw new SandboxSecurityError(result.error as SandboxErrorCode, result.error);
  }
  return JSON.parse(result.output) as FilesystemWriteOutput;
}

export async function filesystemMkdir(path: string): Promise<FilesystemMkdirOutput> {
  const result = await runFilesystem(JSON.stringify({ action: "mkdir", payload: { path } }));
  if (!result.ok) {
    throw new SandboxSecurityError(result.error as SandboxErrorCode, result.error);
  }
  return JSON.parse(result.output) as FilesystemMkdirOutput;
}

export async function filesystemStat(path: string): Promise<FilesystemStatOutput> {
  const result = await runFilesystem(JSON.stringify({ action: "stat", payload: { path } }));
  if (!result.ok) {
    throw new SandboxSecurityError(result.error as SandboxErrorCode, result.error);
  }
  return JSON.parse(result.output) as FilesystemStatOutput;
}

// Exporta MAX_FILE_SIZE para testes
export { MAX_FILE_SIZE, SandboxSecurityError } from "./sandbox";
// Exporta tipos de erro para compatibilidade
export type { SandboxErrorCode } from "./sandbox";
