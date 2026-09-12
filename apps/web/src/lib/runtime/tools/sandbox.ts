import { resolve, normalize, isAbsolute, sep } from "node:path";
import { stat, lstat, realpath } from "node:fs/promises";

// Configuração da sandbox - raiz segura para operações de filesystem
// Suporta sandbox per-user/per-mission via variáveis de ambiente
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
 * Valida recursivamente que um caminho não contém symlinks que escapam da sandbox
 * @param path - Caminho a ser validado
 * @returns O caminho real se for seguro
 * @throws SandboxSecurityError se algum symlink escapar
 */
async function validateNoSymlinkEscape(path: string): Promise<string> {
  const realSandboxRoot = await realpath(SANDBOX_ROOT);
  const realPath = await realpath(path);
  
  // Verifica se o caminho real está dentro da sandbox
  if (!realPath.startsWith(realSandboxRoot + sep) && 
      realPath !== realSandboxRoot) {
    throw new SandboxSecurityError(
      "SYMLINK_ESCAPE",
      `Caminho resolve para fora da sandbox via symlink: ${path} -> ${realPath}`
    );
  }
  
  return realPath;
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
  const realSandboxRoot = await realpath(SANDBOX_ROOT);
  
  // Verifica se o caminho lógico já está fora da sandbox
  if (!resolvedPath.startsWith(realSandboxRoot + sep) && 
      resolvedPath !== realSandboxRoot) {
    throw new SandboxSecurityError("PATH_OUTSIDE_SANDBOX", "Caminho resolve fora da sandbox");
  }

  // Usa realpath para resolver symlinks e verificar o caminho real
  try {
    const realResolvedPath = await realpath(resolvedPath);
    
    // Verifica se o caminho real começa com a raiz real da sandbox
    if (!realResolvedPath.startsWith(realSandboxRoot + sep) && 
        realResolvedPath !== realSandboxRoot) {
      throw new SandboxSecurityError("SYMLINK_ESCAPE", "Caminho resolve para fora da sandbox via symlink");
    }
    
    // Verificação adicional: se o caminho for um symlink, valida o destino
    if (await isSymlink(resolvedPath)) {
      await validateNoSymlinkEscape(resolvedPath);
    }
    
    return realResolvedPath;
  } catch {
    // Se não conseguir resolver (arquivo não existe, etc), verifica o caminho lógico
    // Mas ainda precisa validar que está dentro da sandbox
    if (!resolvedPath.startsWith(realSandboxRoot + sep) && 
        resolvedPath !== realSandboxRoot) {
      throw new SandboxSecurityError("PATH_OUTSIDE_SANDBOX", "Caminho resolve fora da sandbox");
    }
    
    return resolvedPath;
  }
}

/**
 * Cria um caminho seguro para sandbox per-user/per-mission
 * @param userId - ID do usuário
 * @param missionId - ID da missão (opcional)
 * @returns Raiz da sandbox para este usuário/missão
 */
export function getUserSandboxRoot(userId: string, missionId?: string): string {
  // Se SANDBOX_ROOT for configurado, usa como base
  const baseRoot = SANDBOX_ROOT;
  
  // Cria path per-user
  let userSandbox = resolve(baseRoot, userId);
  
  // Se missionId fornecido, adiciona ao path
  if (missionId) {
    userSandbox = resolve(userSandbox, missionId);
  }
  
  return normalize(userSandbox);
}

/**
 * Resolve um caminho dentro da sandbox do usuário de forma segura
 * @param inputPath - Caminho de entrada
 * @param userId - ID do usuário
 * @param missionId - ID da missão (opcional)
 * @returns Caminho absoluto resolvido dentro da sandbox do usuário
 */
export async function resolveUserSandboxPath(
  inputPath: string,
  userId: string,
  missionId?: string
): Promise<string> {
  // Define a raiz da sandbox do usuário
  const userSandboxRoot = getUserSandboxRoot(userId, missionId);
  
  // Temporariamente substitui a raiz global
  const originalRoot = process.env.FILESYSTEM_SANDBOX_ROOT;
  process.env.FILESYSTEM_SANDBOX_ROOT = userSandboxRoot;
  
  try {
    // Resolve o caminho usando a sandbox do usuário
    const resolved = await resolveSandboxPath(inputPath);
    return resolved;
  } finally {
    // Restaura a raiz original
    process.env.FILESYSTEM_SANDBOX_ROOT = originalRoot;
  }
}
