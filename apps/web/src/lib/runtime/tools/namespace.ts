/**
 * H8 — Namespace de sandbox por usuário.
 *
 * Antes: `runFilesystem` usava `executionId || "default"`, então toda chamada sem
 * execução caía no MESMO namespace "default" — arquivos de um usuário ficavam
 * visíveis para outro (vazamento entre tenants) no storage em memória e no
 * diretório `sandbox/exec/default` no modo local.
 *
 * Agora o namespace é sempre `userId__executionId`, com **validação de formato**
 * antes de montar o caminho: `userId` precisa ser UUID e `executionId` precisa ser
 * UUID ou um rótulo interno seguro (`[A-Za-z0-9_-]{1,64}`). Qualquer valor que
 * possa carregar separador de caminho, `..` ou byte estranho é REJEITADO com
 * `SandboxSecurityError("INVALID_INPUT")` em vez de ser silenciosamente "limpo".
 * Operações autenticadas também não podem omitir executionId: não existe fallback
 * `userId__default` para requests de usuário.
 */

import {
  SandboxSecurityError,
  assertSandboxExecutionId,
  assertSandboxUserId,
} from "./sandbox";

const MAX_SEGMENT = 64;

/** Reduz um segmento a [A-Za-z0-9_-]. Mantido para usos não autenticados. */
export function sanitizeNamespaceSegment(value?: string | null): string {
  return (value ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, MAX_SEGMENT);
}

/**
 * Namespace estável e isolado por usuário + execução.
 * Sem usuário conhecido, cai em `anonymous` (isolado do namespace de usuários reais).
 * IDs malformados lançam SandboxSecurityError — nunca viram caminho.
 */
export function sandboxNamespace(
  userId?: string | null,
  executionId?: string | null
): string {
  const user = userId ? assertSandboxUserId(userId) : "anonymous";
  if (userId && !executionId) {
    throw new SandboxSecurityError(
      "INVALID_INPUT",
      "executionId é obrigatório para operações autenticadas"
    );
  }
  const exec = executionId ? assertSandboxExecutionId(executionId) : "default";
  return `${user}__${exec}`;
}

export { SandboxSecurityError };
