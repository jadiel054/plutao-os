/**
 * Recuperação de obstáculos no dispatcher — ponte entre o registro de
 * experiências e o plano de recuperação.
 *
 * Funções PURAS (testáveis): decisão de retry para obstáculos transitórios,
 * cálculo de métodos que já falharam, ranking de alternativas por
 * experiência e resumo de problemas conhecidos. A integração no
 * dispatchTool injeta as experiências reais do usuário.
 */

import { rankAlternatives, type OperationalKnowledge } from "./operational-knowledge";
import type { AlternativeCandidate, Obstacle } from "./obstacle-recovery";

/** Obstáculos que justificam UM retry automático do mesmo método. */
const AUTO_RETRY_KINDS = new Set(["TRANSIENT", "TIMEOUT"]);

export function shouldAutoRetry(obstacle: Obstacle): boolean {
  return AUTO_RETRY_KINDS.has(obstacle.kind);
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