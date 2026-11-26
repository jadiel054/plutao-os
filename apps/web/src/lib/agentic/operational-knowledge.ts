/**
 * Conhecimento operacional do núcleo agêntico.
 *
 * Diferencia explicitamente os quatro estados de conhecimento:
 *   - confirmed:         confirmado por exploração/probe autorizada.
 *   - hypothesis:        inferido de documentação, ainda sem confirmação.
 *   - succeeded_experience: experiência de execução bem-sucedida.
 *   - failed_method:     método que FALHOU (nunca é regra permanente).
 *
 * Nada aqui vira regra inflexível: toda aplicação passa por checagem de
 * compatibilidade (versão, ambiente, permissões, validade temporal).
 */

export type KnowledgeKind =
  | "confirmed"
  | "hypothesis"
  | "succeeded_experience"
  | "failed_method";

export type KnowledgeRequirements = {
  auth?: string[];
  permissions?: string[];
  toolVersion?: string;
  environment?: string;
};

export type OperationalKnowledge = {
  id: string;
  /** Alvo do conhecimento: ferramenta, capability, página ou integração. */
  subject: string;
  /** Método operacional: como usar, com contratos e parâmetros. */
  method: string;
  kind: KnowledgeKind;
  /** Quando o conhecimento foi observado/validado (ISO). */
  observedAt: string;
  /** Depois de expira, precisa ser reconfirmado (opcional, ISO). */
  validUntil?: string;
  requirements?: KnowledgeRequirements;
  limitations?: string[];
  /** Em que situações esta experiência pode ser reutilizada. */
  usefulFor?: string[];
  /** Evidências reais (ids de evidência, trechos de doc, resultado de probe). */
  evidence?: string[];
  cause?: string;
};

export type ApplicabilityContext = {
  now?: string;
  toolVersion?: string;
  environment?: string;
  permissions?: string[];
};

export type KnowledgeStatus = "applicable" | "stale" | "incompatible" | "missing_permission";

/**
 * Decide se um conhecimento ainda é aplicável AGORA. Nenhuma experiência
 * antiga é regra permanente: versão, ambiente, permissões e validade
 * temporal podem invalidá-la.
 */
export function assessKnowledge(
  k: OperationalKnowledge,
  ctx: ApplicabilityContext = {}
): KnowledgeStatus {
  const now = ctx.now ?? new Date().toISOString();
  if (k.validUntil && Date.parse(k.validUntil) < Date.parse(now)) return "stale";
  const req = k.requirements ?? {};
  if (req.toolVersion && ctx.toolVersion && req.toolVersion !== ctx.toolVersion) return "incompatible";
  if (req.environment && ctx.environment && req.environment !== ctx.environment) return "incompatible";
  if (req.permissions && req.permissions.length > 0) {
    const have = new Set((ctx.permissions ?? []).map((p) => p.trim()));
    const missing = req.permissions.some((p) => !have.has(p));
    if (missing) return "missing_permission";
  }
  return "applicable";
}

export type RankedAlternative<T> = {
  item: T;
  score: number;
  reason: string;
};

type ScorableItem = {
  id: string;
  subject?: string;
  kind?: KnowledgeKind;
};

const KIND_WEIGHT: Record<KnowledgeKind, number> = {
  confirmed: 40,
  succeeded_experience: 30,
  hypothesis: 10,
  failed_method: -50,
};

/**
 * Ordena alternativas usando experiências registradas:
 *   - método que falhou vai para o fim (e é excluído se houver alternativa);
 *   - conhecimento confirmado/experiência bem-sucedida sobe;
 *   - experiência obsoleta/incompatível vale zero (não ajuda nem pune).
 */
export function rankAlternatives<T extends ScorableItem>(
  alternatives: T[],
  experiences: OperationalKnowledge[],
  ctx: ApplicabilityContext = {}
): RankedAlternative<T>[] {
  return alternatives
    .map((alt) => {
      let score = 0;
      let reason = "sem experiência registrada";
      const related = experiences.filter(
        (e) => e.subject === alt.subject || e.subject === alt.id || e.id === alt.id
      );
      for (const exp of related) {
        const status = assessKnowledge(exp, ctx);
        if (status !== "applicable") continue;
        const w = KIND_WEIGHT[exp.kind] ?? 0;
        if (w !== 0) {
          score += w;
          reason = exp.kind === "failed_method"
            ? "método já falhou antes (evitar)"
            : "experiência/conhecimento favorável";
        }
      }
      return { item: alt, score, reason };
    })
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
}

/**
 * Resumo operacional curto (para prompts e views). Nunca afirma o que
 * não está no registro.
 */
export function knowledgeSummary(k: OperationalKnowledge): string {
  const label: Record<KnowledgeKind, string> = {
    confirmed: "confirmado",
    hypothesis: "hipótese (não confirmado)",
    succeeded_experience: "experiência bem-sucedida",
    failed_method: "método que falhou",
  };
  const parts = [k.subject + " — " + label[k.kind]];
  if (k.limitations && k.limitations.length > 0) parts.push("limitações: " + k.limitations.join("; "));
  if (k.requirements?.permissions && k.requirements.permissions.length > 0) {
    parts.push("permissões: " + k.requirements.permissions.join(", "));
  }
  return parts.join(" | ");
}
