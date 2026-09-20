/**
 * Extrai passos numerados de uma resposta do Núcleo (Planejador implícito).
 * Aceita linhas no formato:
 *   1. Título
 *   1) Título
 *   - Título (só se houver pelo menos 3 e contexto de plano)
 *
 * Não extrai inventário de conectores, status de conta ou listas de capabilities.
 */

export type SuggestedPlan = {
  stepTitles: string[];
  objectiveHint?: string;
};

const NUMBERED =
  /^\s*(?:\d+[.)]\s+|[-*]\s+)(.{3,120})\s*$/;

/** Linhas típicas de status/capabilities — não são passos de missão. */
function looksLikeConnectorInventory(title: string): boolean {
  const t = title.toLowerCase();
  if (/\bstatus\s*[:=]?\s*(connected|disconnected|error|ativo|conectado)/i.test(t)) return true;
  if (/\b(conta@|account@|@\w+)\b/.test(t) && /\b(github|vercel|neon|stripe|render)\b/i.test(t)) return true;
  if (/\bcapacidades?\s+dispon/i.test(t)) return true;
  if (/\b(connected|disconnected)\b/i.test(t) && /\b(github|vercel)\b/i.test(t)) return true;
  // capability ids estilo snake_case de conector
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(title.trim())) return true;
  if (/\b(repos_list|projects_list|deployments_list|issues_list|pulls_list)\b/i.test(t)) return true;
  return false;
}

function hasMissionContext(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(plano|missão|missao|passos?|execut|implement|construir|criar\s+(um|uma|o|a)|vamos\s+)/i.test(t) ||
    /\b(objetivo|entregável|entregavel|roadmap)\b/i.test(t)
  );
}

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
    if (looksLikeConnectorInventory(title)) continue;
    titles.push(title);
  }

  // Plano útil: 3–12 passos
  if (titles.length < 3 || titles.length > 12) return null;

  // Sem contexto de missão/plano, listas numeradas (ex.: status de conectores) não viram missão
  if (!hasMissionContext(assistantText)) return null;

  return { stepTitles: titles };
}
