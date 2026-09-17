/**
 * Extrai passos numerados de uma resposta do Núcleo (Planejador implícito).
 * Aceita linhas no formato:
 *   1. Título
 *   1) Título
 *   - Título (só se houver pelo menos 3 e contexto de plano)
 */

export type SuggestedPlan = {
  stepTitles: string[];
  objectiveHint?: string;
};

const NUMBERED =
  /^\s*(?:\d+[.)]\s+|[-*]\s+)(.{3,120})\s*$/;

export function extractSuggestedPlan(assistantText: string): SuggestedPlan | null {
  if (!assistantText || assistantText.length < 20) return null;

  const lines = assistantText.split(/\r?\n/);
  const titles: string[] = [];

  for (const line of lines) {
    const m = line.match(NUMBERED);
    if (!m) continue;
    const title = m[1].replace(/\*+/g, "").trim();
    if (title.length < 3) continue;
    // Evita capturar perguntas longas como "passo"
    if (title.endsWith("?") && title.length > 60) continue;
    titles.push(title);
  }

  // Plano útil: 3–12 passos
  if (titles.length < 3 || titles.length > 12) return null;

  return { stepTitles: titles };
}
