import { resolve, normalize, isAbsolute, sep } from "node:path";
import { stat, lstat, realpath } from "node:fs/promises";

// Configuração da sandbox - raiz segura para operações de filesystem
const SANDBOX_ROOT = process.env.FILESYSTEM_SANDBOX_ROOT ?? 
  resolve(process.cwd(), "apps", "web", "sandbox");

// Limite de tamanho para leitura/escrita de arquivos (1MB para V1)
export const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// Tipos de erros da sandbox
export type SandboxErrorCode =
  | "PATH_OUTSIDE_SANDBOX"
  | "PATH_TRAVERSAL"
  | "SYMLINK_ESCAPE"
  | "INVALID_INPUT"
  | "FILE_TOO_LARGE"
  | "WRITE_TOO_LARGE"
  | "FILE_NOT_FOUND"
  | "NOT_A_FILE"
  | "NOT_A_DIRECTORY"
  | "PERMISSION_DENIED"
  | "UNSUPPORTED_OPERATION";

// Classe de erro da sandbox
export class SandboxSecurityError extends Error {
  constructor(
    public readonly code: SandboxErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SandboxSecurityError";
  }
}

// Tipo para compatibilidade
export type SandboxError = SandboxSecurityError;

/**
 * Resolve um caminho dentro da sandbox de forma segura.
 * Garante que o caminho final esteja dentro da raiz da sandbox.
 * 
 * @param inputPath - Caminho de entrada fornecido pelo usuário/modelo
 * @returns Caminho absoluto resolvido dentro da sandbox
 * @throws SandboxSecurityError se o caminho escapar da sandbox
 */
export async function resolveSandboxPath(inputPath: string): Promise<string> {
  if (!inputPath || typeof inputPath !== "string") {
    throw new SandboxSecurityError("INVALID_INPUT", "Caminho inválido ou vazio");
  }

  // Normaliza o caminho (resolve .., ., etc)
  const normalizedPath = normalize(inputPath);

  // Rejeita caminhos absolutos diretos
  if (isAbsolute(normalizedPath)) {
    throw new SandboxSecurityError("PATH_OUTSIDE_SANDBOX", "Caminhos absolutos não são permitidos");
  }

  // Rejeita tentativas óbvias de traversal
  if (normalizedPath.includes(`..${sep}`) || normalizedPath.startsWith(`..${sep}`)) {
    throw new SandboxSecurityError("PATH_TRAVERSAL", "Tentativa de path traversal detectada");
  }

  // Resolve o caminho relativo à raiz da sandbox
  let resolvedPath = resolve(SANDBOX_ROOT, normalizedPath);

  // Normaliza novamente para garantir consistência
  resolvedPath = normalize(resolvedPath);

  // Verifica se o caminho resolvido está dentro da sandbox
  // Usa realpath para resolver symlinks e verificar o caminho real
  try {
    const realResolvedPath = await realpath(resolvedPath);
    const realSandboxRoot = await realpath(SANDBOX_ROOT);
    
    // Verifica se o caminho real começa com a raiz real da sandbox
    if (!realResolvedPath.startsWith(realSandboxRoot + sep) && 
        realResolvedPath !== realSandboxRoot) {
      throw new SandboxSecurityError("PATH_OUTSIDE_SANDBOX", "Caminho resolve fora da sandbox");
    }
    
    return realResolvedPath;
  } catch {
    // Se não conseguir resolver (arquivo não existe, etc), verifica o caminho lógico
    const realSandboxRoot = await realpath(SANDBOX_ROOT);
    
    // Verifica se o caminho resolvido começa com a raiz da sandbox
    if (!resolvedPath.startsWith(realSandboxRoot + sep) && 
        resolvedPath !== realSandboxRoot) {
      throw new SandboxSecurityError("PATH_OUTSIDE_SANDBOX", "Caminho resolve fora da sandbox");
    }
    
    return resolvedPath;
  }
}

/**
 * Verifica se um caminho é um arquivo
 */
export async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Verifica se um caminho é um diretório
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Verifica se um caminho existe
 */
export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica se um caminho é um symlink
 */
export async function isSymlink(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Obtém a raiz da sandbox
 */
export function getSandboxRoot(): string {
  return SANDBOX_ROOT;
}

/**
 * Verifica se um caminho está dentro da sandbox (sem resolver symlinks)
 */
export function isInsideSandbox(path: string): boolean {
  const normalized = normalize(path);
  const sandboxRoot = normalize(SANDBOX_ROOT);
  return normalized.startsWith(sandboxRoot + sep) || normalized === sandboxRoot;
}
