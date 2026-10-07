/**
 * H8 — Namespace de sandbox por usuário.
 *
 * Antes: `runFilesystem` usava `executionId || "default"`, então toda chamada sem
 * execução caía no MESMO namespace "default" — arquivos de um usuário ficavam
 * visíveis para outro (vazamento entre tenants) no storage em memória e no
 * diretório `sandbox/exec/default` no modo local.
 *
 * Agora o namespace é sempre `userId__executionId`, com cada segmento reduzido a
 * [A-Za-z0-9_-] (nada de separadores, `..`, ou nomes vazios).
 */

const MAX_SEGMENT = 64;

export function sanitizeNamespaceSegment(value?: string | null): string {
  return (value ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, MAX_SEGMENT);
}

/**
 * Namespace estável e isolado por usuário + execução.
 * Sem usuário conhecido, cai em `anonymous` (isolado do namespace de usuários reais).
 */
export function sandboxNamespace(
  userId?: string | null,
  executionId?: string | null
): string {
  const user = sanitizeNamespaceSegment(userId) || "anonymous";
  const exec = sanitizeNamespaceSegment(executionId) || "default";
  return `${user}__${exec}`;
}
