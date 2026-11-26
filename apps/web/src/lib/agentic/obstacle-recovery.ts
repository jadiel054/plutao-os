/**
 * Recuperação transversal de obstáculos.
 *
 * Núcleo do comportamento: quando uma ferramenta/API/conector/método não
 * consegue fornecer o que a missão exige, o Plutão identifica a falha,
 * avalia alternativas autorizadas, executa a mais confiável, valida o
 * resultado e registra a experiência. Nunca abandona a missão por uma
 * limitação pontual quando existe caminho legítimo; nunca inventa dados.
 */

export type ObstacleKind =
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "TOOL_UNAVAILABLE"
  | "VALIDATION_FAILED"
  | "TIMEOUT"
  | "TRANSIENT"
  | "UNKNOWN";

export type RecoveryStepKind =
  | "retry"
  | "alternative_capability"
  | "cross_environment"
  | "learn_tool"
  | "human_intervention";

export type RecoveryStep = {
  kind: RecoveryStepKind;
  /** Capability/execução concreta, quando aplicável. */
  capabilityId?: string;
  /** Ambiente de execução (connector, sandbox, computer...). */
  environment?: string;
  instruction: string;
  /** Escritas exigem autorização humana (gate) — sempre. */
  requiresHumanApproval?: boolean;
};

export type RecoveryPolicy = {
  maxAttempts: number;
  /** Escritas nunca são tentadas sem gate humano. */
  allowWriteAlternatives: boolean;
  /** true somente quando há ambiente seguro de probe. */
  allowAuthorizedExploration: boolean;
};

export const DEFAULT_RECOVERY_POLICY: RecoveryPolicy = {
  maxAttempts: 3,
  allowWriteAlternatives: false,
  allowAuthorizedExploration: false,
};

export type Obstacle = {
  kind: ObstacleKind;
  /** O que está faltando de fato (permissão, recurso, serviço...). */
  missing?: string;
  detail?: string;
};

const PERMISSION_PATTERNS = [
  /40[13]/,
  /unauthor/i, /forbidden/i, /permiss/i, /não autorizado/i, /nao autorizado/i,
  /CAPABILITY_BLOCKED/, /SPECIALIST_TOOL_NOT_ALLOWED/, /WRITE_GATE/, /GATE/,
];
const NOT_FOUND_PATTERNS = [/404/, /not.?found/i, /não encontrado/i, /nao encontrado/i, /NOT_FOUND/];
const RATE_LIMIT_PATTERNS = [/429/, /rate.?limit/i, /quota/i, /too many/i];
const UNAVAILABLE_PATTERNS = [/50[23]/, /unavailable/i, /indispon/i, /UNKNOWN_TOOL/, /NOT_REGISTERED/, /DISABLED/];
const VALIDATION_PATTERNS = [/422/, /invalid/i, /inválid/i, /valida/i, /VALIDATION/];
const TIMEOUT_PATTERNS = [/timeout/i, /timed.?out/i, /ECONNABORTED/, /aborted/i, /orçamento/i, /budget/i];

export function classifyObstacle(errorText: string | null | undefined): Obstacle {
  const text = String(errorText ?? "");
  if (!text.trim()) return { kind: "UNKNOWN", detail: "sem mensagem de erro" };
  const pick = (patterns: RegExp[], kind: ObstacleKind): ObstacleKind | null =>
    patterns.some((p) => p.test(text)) ? kind : null;
  const kind =
    pick(PERMISSION_PATTERNS, "PERMISSION_DENIED") ??
    pick(RATE_LIMIT_PATTERNS, "RATE_LIMITED") ??
    pick(NOT_FOUND_PATTERNS, "NOT_FOUND") ??
    pick(TIMEOUT_PATTERNS, "TIMEOUT") ??
    pick(VALIDATION_PATTERNS, "VALIDATION_FAILED") ??
    pick(UNAVAILABLE_PATTERNS, "TOOL_UNAVAILABLE") ??
    (/5[0-9][0-9]|ECONN|network|rede/i.test(text) ? "TRANSIENT" : null);
  return { kind: kind ?? "UNKNOWN", detail: text.slice(0, 400) };
}

export type AlternativeCandidate = {
  id: string;
  /** Ex.: "github.prs.get". */
  subject: string;
  mode: "read" | "write";
  environment?: string;
  instruction: string;
};

export type RecoveryPlan = {
  feasible: boolean;
  /** null ⇒ intervenção humana é o único caminho. */
  steps: RecoveryStep[];
  rationale: string;
  needsHuman: boolean;
};

export type PlanRecoveryInput = {
  goal: string;
  failedMethod: string;
  obstacle: Obstacle;
  alternatives: AlternativeCandidate[];
  policy: RecoveryPolicy;
  /** Ids de métodos que já falharam (experiências registradas). */
  knownFailed?: string[];
};

/**
 * Plano de recuperação determinístico e seguro:
 *   1. alternativas READ autorizadas primeiro (sem gate);
 *   2. alternativas WRITE só se a política permitir e SEMPRE com gate humano;
 *   3. exploração autorizada (aprendizado) se permitida;
 *   4. intervenção humana como último recurso — nunca contorna controles.
 * Métodos que já falharam (knownFailed) são excluídos.
 */
export function planRecovery(input: PlanRecoveryInput): RecoveryPlan {
  const { goal, failedMethod, obstacle, alternatives, policy, knownFailed = [] } = input;
  const failed = new Set(knownFailed);
  failed.add(failedMethod);
  const viable = alternatives.filter((a) => !failed.has(a.id) && !failed.has(a.subject));

  const steps: RecoveryStep[] = [];
  const reads = viable.filter((a) => a.mode === "read");
  const writes = policy.allowWriteAlternatives ? viable.filter((a) => a.mode === "write") : [];

  for (const alt of reads.slice(0, policy.maxAttempts)) {
    steps.push({
      kind: alt.environment && alt.environment !== "connector" ? "cross_environment" : "alternative_capability",
      capabilityId: alt.subject,
      environment: alt.environment ?? "connector",
      instruction: alt.instruction || ("Executar " + alt.subject + " para atingir: " + goal),
    });
  }
  for (const alt of writes.slice(0, policy.maxAttempts)) {
    steps.push({
      kind: "alternative_capability",
      capabilityId: alt.subject,
      environment: alt.environment ?? "connector",
      instruction: alt.instruction || ("Executar " + alt.subject + " (escrita) para atingir: " + goal),
      requiresHumanApproval: true,
    });
  }
  if (steps.length === 0 && policy.allowAuthorizedExploration) {
    steps.push({
      kind: "learn_tool",
      environment: "sandbox",
      instruction:
        "Estudar documentação/exploração autorizada para descobrir método válido para: " + goal +
        ". Registrar o conhecimento antes de tentar novamente.",
    });
  }
  if (steps.length === 0) {
    return {
      feasible: false,
      steps: [
        {
          kind: "human_intervention",
          instruction:
            "Intervenção humana necessária: " + describeObstacle(obstacle) +
            " Nenhum caminho alternativo autorizado foi encontrado para: " + goal +
            ". Não invente resultados; reporte o que falta.",
        },
      ],
      rationale: "Sem alternativa autorizada; escala para humano.",
      needsHuman: true,
    };
  }
  return {
    feasible: true,
    steps,
    rationale:
      "Falha (" + obstacle.kind + ") no método " + failedMethod + "; alternativas autorizadas ordenadas por confiabilidade.",
    needsHuman: false,
  };
}

export function describeObstacle(obstacle: Obstacle): string {
  const label: Record<ObstacleKind, string> = {
    PERMISSION_DENIED: "permissão negada",
    NOT_FOUND: "recurso não encontrado",
    RATE_LIMITED: "limite de uso atingido",
    TOOL_UNAVAILABLE: "ferramenta indisponível/não registrada",
    VALIDATION_FAILED: "validação de entrada falhou",
    TIMEOUT: "tempo/orçamento esgotado",
    TRANSIENT: "falha transitória de rede/serviço",
    UNKNOWN: "falha não classificada",
  };
  const base = label[obstacle.kind];
  return obstacle.missing ? base + " (falta: " + obstacle.missing + ")" : base + ".";
}

export type RecoveryAttempt = {
  step: RecoveryStep;
  ok: boolean;
  output?: string;
  error?: string;
};

export type RecoveryLoopResult = {
  resolved: boolean;
  attempts: RecoveryAttempt[];
  final?: RecoveryAttempt;
  needsHuman: boolean;
  experiences: { methodId: string; ok: boolean; outputOrError: string }[];
};

export type RecoveryRequirement = {
  /** Trecho que precisa existir na saída para validar o resultado. */
  outputIncludes?: string;
  minLength?: number;
};

/**
 * Valida se a alternativa obteve REALMENTE o resultado necessário
 * (não basta "sem erro").
 */
export function validateResult(attempt: RecoveryAttempt, req: RecoveryRequirement): boolean {
  if (!attempt.ok) return false;
  const out = attempt.output ?? "";
  if (req.minLength != null && out.length < req.minLength) return false;
  if (req.outputIncludes && !out.includes(req.outputIncludes)) return false;
  return true;
}

/**
 * Loop de recuperação: executa o plano, valida cada resultado, persiste a
 * experiência (sucesso e fracasso) e desiste apenas quando esgotar o plano —
 * devolvendo needsHuman em vez de abandonar silenciosamente.
 */
export async function runWithRecovery(
  plan: RecoveryPlan,
  req: RecoveryRequirement,
  executor: (step: RecoveryStep) => Promise<RecoveryAttempt>,
  onExperience?: (exp: { methodId: string; ok: boolean; outputOrError: string }) => Promise<void> | void
): Promise<RecoveryLoopResult> {
  const attempts: RecoveryAttempt[] = [];
  const experiences: RecoveryLoopResult["experiences"] = [];
  for (const step of plan.steps) {
    if (step.kind === "human_intervention") break;
    const attempt = await executor(step);
    attempts.push(attempt);
    const valid = validateResult(attempt, req);
    const entry = {
      methodId: step.capabilityId ?? step.kind,
      ok: valid,
      outputOrError: (valid ? (attempt.output ?? "") : (attempt.error ?? "")).slice(0, 500),
    };
    experiences.push(entry);
    if (onExperience) await onExperience(entry);
    if (valid) {
      return { resolved: true, attempts, final: attempt, needsHuman: false, experiences };
    }
  }
  const humanStep = plan.steps.find((s) => s.kind === "human_intervention");
  return {
    resolved: false,
    attempts,
    final: humanStep
      ? { step: humanStep, ok: false, error: "requer intervenção humana" }
      : attempts[attempts.length - 1],
    needsHuman: plan.needsHuman || attempts.every((a) => !validateResult(a, req)),
    experiences,
  };
}

/**
 * Mapeia uma tool interna para candidates de recuperação consultando o
 * registro de capacidades (apenas alternativas habilitadas).
 */
export type ToolFailureContext = {
  tool: string;
  error: string;
  goal: string;
  enabledCapabilityIds: string[];
  knownFailed?: string[];
};

const ENVIRONMENT_BY_TOOL: Record<string, string> = {
  computer: "computer",
  playwright: "browser",
  artemis: "device",
  maestro: "device",
  appium: "device",
};

export function alternativesForTool(ctx: ToolFailureContext): AlternativeCandidate[] {
  const provider = ctx.tool.split(".")[0];
  return ctx.enabledCapabilityIds
    .filter((id) => id.startsWith(provider + ".") && id !== ctx.tool)
    .map((id) => ({
      id,
      subject: id,
      mode: /write|create|push|deploy|send|exec|set/i.test(id) ? ("write" as const) : ("read" as const),
      environment: ENVIRONMENT_BY_TOOL[provider] ?? "connector",
      instruction: "Alternativa à tool '" + ctx.tool + "': usar " + id + " para alcançar o mesmo objetivo.",
    }));
}
