/**
 * Sandbox de filesystem — validação de caminhos.
 *
 * H8: correções aplicadas
 *  - `realpath(SANDBOX_ROOT)` era chamado fora do try/catch: se a raiz não
 *    existisse, a resolução lançava e o tool devolvia PERMISSION_DENIED. Agora a
 *    raiz é criada sob demanda (`ensureSandboxRoot`) e o caminho é validado mesmo
 *    quando o alvo ainda não existe (valida o ancestral existente mais próximo).
 *  - `resolveUserSandboxPath` mutava `process.env.FILESYSTEM_SANDBOX_ROOT`
 *    globalmente — em serverless isso é corrida entre requisições concorrentes e
 *    podia fazer um usuário resolver dentro da sandbox de outro. Agora a raiz é
 *    um parâmetro explícito e não há estado global mutável.
 */

import { resolve, normalize, isAbsolute, sep } from "node:path";
import { stat, lstat, realpath, mkdir } from "node:fs/promises";

const SANDBOX_ROOT = process.env.FILESYSTEM_SANDBOX_ROOT
  ? resolve(process.env.FILESYSTEM_SANDBOX_ROOT)
  : resolve(process.cwd(), "apps", "web", "sandbox");

export const MAX_FILE_SIZE = 1024 * 1024; // 1MB

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

export class SandboxSecurityError extends Error {
  constructor(
    public readonly code: SandboxErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SandboxSecurityError";
  }
}

export type SandboxError = SandboxSecurityError;

export function getSandboxRoot(): string {
  return SANDBOX_ROOT;
}

/** Cria a raiz da sandbox se necessário e devolve seu caminho real. */
export async function ensureSandboxRoot(root: string = SANDBOX_ROOT): Promise<string> {
  try {
    await mkdir(root, { recursive: true });
  } catch {
    /* já existe ou sem permissão — o realpath abaixo decide */
  }
  try {
    return await realpath(root);
  } catch {
    return normalize(root);
  }
}

function isWithin(root: string, candidate: string): boolean {
  const r = normalize(root);
  const c = normalize(candidate);
  return c === r || c.startsWith(r + sep);
}

/** Verificação lógica de contenção (sem resolver symlinks). */
export function isInsideSandbox(path: string, root: string = SANDBOX_ROOT): boolean {
  return isWithin(normalize(root), normalize(path));
}

export async function isSymlink(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Valida um caminho de entrada contra a raiz informada.
 *
 * - rejeita caminhos absolutos e traversal lógico;
 * - resolve o ancestral EXISTENTE mais próximo e garante que ele (via realpath)
 *   continua dentro da raiz — isso bloqueia escape por symlink mesmo quando o
 *   arquivo de destino ainda não existe.
 */
export async function resolveSandboxPath(
  inputPath: string,
  root: string = SANDBOX_ROOT
): Promise<string> {
  if (!inputPath || typeof inputPath !== "string") {
    throw new SandboxSecurityError("INVALID_INPUT", "Caminho inválido ou vazio");
  }

  const normalizedPath = normalize(inputPath);

  if (isAbsolute(normalizedPath)) {
    throw new SandboxSecurityError("PATH_OUTSIDE_SANDBOX", "Caminhos absolutos não são permitidos");
  }
  if (normalizedPath === ".." || normalizedPath.startsWith(`..${sep}`)) {
    throw new SandboxSecurityError("PATH_TRAVERSAL", "Tentativa de path traversal detectada");
  }

  const realRoot = await ensureSandboxRoot(root);
  const resolvedPath = normalize(resolve(realRoot, normalizedPath));

  if (!isWithin(realRoot, resolvedPath)) {
    throw new SandboxSecurityError("PATH_OUTSIDE_SANDBOX", "Caminho resolve fora da sandbox");
  }

  // Ancestral existente mais próximo → realpath → contenção.
  let probe = resolvedPath;
  for (;;) {
    if (await exists(probe)) {
      let realProbe: string;
      try {
        realProbe = await realpath(probe);
      } catch {
        realProbe = probe;
      }
      if (!isWithin(realRoot, realProbe)) {
        throw new SandboxSecurityError(
          "SYMLINK_ESCAPE",
          "Caminho resolve para fora da sandbox via symlink"
        );
      }
      break;
    }
    const parent = normalize(resolve(probe, ".."));
    if (parent === probe) break;
    if (!isWithin(realRoot, parent)) break;
    probe = parent;
  }

  return resolvedPath;
}

/** Raiz de sandbox por usuário/missão (sem efeitos colaterais globais). */
export function getUserSandboxRoot(userId: string, missionId?: string): string {
  let userSandbox = resolve(SANDBOX_ROOT, userId);
  if (missionId) userSandbox = resolve(userSandbox, missionId);
  return normalize(userSandbox);
}

/** Wrapper puro: resolve dentro da raiz do usuário, sem mutar variáveis de ambiente. */
export async function resolveUserSandboxPath(
  inputPath: string,
  userId: string,
  missionId?: string
): Promise<string> {
  return resolveSandboxPath(inputPath, getUserSandboxRoot(userId, missionId));
}
