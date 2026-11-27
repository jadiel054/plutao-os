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

/**
 * Decisão de retry automático.
 * - Sem tool informada (compatibilidade): apenas obstáculos TRANSIENT/TIMEOUT.
 * - Com tool informada: TIMEOUT exige tool idempotente; TRANSIENT (falha de
 *   conexão, request tipicamente não processado) segue permitido.
 */
export function shouldAutoRetry(obstacle: Obstacle, tool?: string): boolean {
  if (!AUTO_RETRY_KINDS.has(obstacle.kind)) return false;
  if (obstacle.kind === "TIMEOUT" && tool !== undefined) {
    return IDEMPOTENT_TOOLS.has(tool);
  }
  return true;
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