/**
 * Recuperação de obstáculos no dispatcher — ponte entre o registro de
 * experiências e o plano de recuperação.
 *
 * Funções PURAS (testáveis): decisão de retry para obstáculos transitórios,
 * cálculo de métodos que já falharam, ranking de alternativas por
 * experiência e resumo de problemas conhecidos. A integração no
 * dispatchTool injeta as experiências reais do usuário.
 *
 * Segurança de retry: TIMEOUT só justifica retry automático em tools
 * registradas como idempotentes (IDEMPOTENT_TOOLS) — um timeout pode
 * significar sucesso remoto, e repetir uma ação não idempotente sem
 * verificar o estado pode duplicar efeitos. Para tools não idempotentes,
 * o resultado após TIMEOUT é reportado como incerto (TIMEOUT_UNCERTAIN_NOTE)
 * e a ação NÃO é repetida automaticamente.
 */

import { rankAlternatives, type OperationalKnowledge } from "./operational-knowledge";
import type { AlternativeCandidate, Obstacle } from "./obstacle-recovery";

/** Obstáculos que podem justificar UM retry automático do mesmo método. */
const AUTO_RETRY_KINDS = new Set(["TRANSIENT", "TIMEOUT"]);

/**
 * Tools com execução IDEMPOTENTE verificada (repetir a mesma chamada não
 * duplica efeitos). Somente estas podem ter retry automático após TIMEOUT.
 * Manter esta lista ESTrita: adicionar uma tool exige confirmar que seu
 * executor é idempotente (ou usa idempotency key).
 */
export const IDEMPOTENT_TOOLS: ReadonlySet<string> = new Set([
  "files.export_pdf",
  "files.export_xlsx",
  "files.export_markdown",
  "files.export_html",
]);

/** Mensagem padrão de resultado incerto após TIMEOUT em tool não idempotente. */
export const TIMEOUT_UNCERTAIN_NOTE =
  "resultado incerto: TIMEOUT em tool não idempotente; verifique o estado remoto antes de repetir a ação";

/** Mensagem padrão de resultado incerto após falha de conexão (TRANSIENT) em tool não idempotente. */
export const TRANSIENT_UNCERTAIN_NOTE =
  "resultado incerto: falha de conexão após o envio; a operação remota pode ter sido executada; verifique o estado antes de repetir a ação";

/** Contexto de retry: idempotency key informada pela tool/input. */
export type RetryContext = { hasIdempotencyKey?: boolean };

export type RetryDecision =
  | { outcome: "safe_retry"; reason: string }
  | { outcome: "uncertain"; reason: string }
  | { outcome: "no_retry"; reason: string };

/**
 * Decisão SEGURA de retry automático — NÃO se apoia na classificação do
 * erro como prova de que a operação não foi executada:
 * - tool idempotente registrada: retry seguro (repetir não duplica efeitos).
 * - idempotency key informada no input: retry seguro (deduplicado pelo
 *   dispatcher via histórico de toolCalls).
 * - tool mutável SEM idempotency key: NUNCA repete automaticamente. TIMEOUT
 *   e falha de conexão podem ocorrer DEPOIS de a operação remota produzir
 *   efeito; o resultado fica INCERTO e exige verificação do estado real
 *   antes de qualquer repetição (feedback explícito ao usuário).
 * - obstáculo não transitório: sem retry (segue plano de recuperação).
 */
export function retryDecision(
  obstacle: Obstacle,
  tool?: string,
  ctx?: RetryContext
): RetryDecision {
  if (!AUTO_RETRY_KINDS.has(obstacle.kind)) {
    return { outcome: "no_retry", reason: "obstáculo não transitório; a recuperação segue o plano/alternativas autorizadas" };
  }
  if (tool !== undefined && IDEMPOTENT_TOOLS.has(tool)) {
    return { outcome: "safe_retry", reason: "tool idempotente: repetição não duplica efeitos" };
  }
  if (ctx?.hasIdempotencyKey) {
    return { outcome: "safe_retry", reason: "idempotency key informada: repetição é deduplicada pelo dispatcher" };
  }
  if (tool === undefined) {
    // Compatibilidade com chamadas legadas sem tool identificada.
    return { outcome: "safe_retry", reason: "tool não informada (compatibilidade)" };
  }
  const note = obstacle.kind === "TIMEOUT" ? TIMEOUT_UNCERTAIN_NOTE : TRANSIENT_UNCERTAIN_NOTE;
  return { outcome: "uncertain", reason: note + " (tool: " + tool + ")" };
}

/** Compatibilidade: decisão booleana derivada de retryDecision. */
export function shouldAutoRetry(obstacle: Obstacle, tool?: string, ctx?: RetryContext): boolean {
  return retryDecision(obstacle, tool, ctx).outcome === "safe_retry";
}

/**
 * Métodos que já falharam (experiências registradas). O método que acabou de
 * falhar entra explicitamente; experiências failed_method de OUTROS assuntos
 * viram alternativas a evitar no plano.
 */
export function computeKnownFailed(failedTool: string, experiences: OperationalKnowledge[]): string[] {
  const ids = new Set<string>([failedTool]);
  for (const e of experiences) {
    if (e.kind === "failed_method" && e.subject && e.subject !== failedTool) ids.add(e.subject);
  }
  return [...ids];
}

/** Alternativas reordenadas pela experiência real (sucesso sobe, falha desce). */
export function rankForRecovery(
  alternatives: AlternativeCandidate[],
  experiences: OperationalKnowledge[]
): AlternativeCandidate[] {
  return rankAlternatives(alternatives, experiences).map((r) => r.item);
}

/** Resumo curto (para o resultado do dispatch) do que já se sabe falho. */
export function summarizeKnownIssues(experiences: OperationalKnowledge[], max = 3): string[] {
  return experiences
    .filter((e) => e.kind === "failed_method")
    .slice(0, max)
    .map((e) => "falha conhecida em " + e.subject + (e.cause ? ": " + e.cause : ""));
}

/**
 * Fecha o ciclo: quando um método que antes falhou agora tem uma execução
 * bem-sucedida, registra a experiência positiva (chamado apenas quando há
 * registro de falha prévia ou recuperação nesta chamada).
 */
export function successExperienceFor(tool: string, note?: string) {
  return {
    subject: tool,
    kind: "succeeded_experience" as const,
    method: "dispatchTool(" + tool + ")" + (note ? " [" + note + "]" : ""),
    usefulFor: ["recuperação de obstáculos", "prevenção de falhas repetidas"],
  };
}