export const MISSION_CREATION_SOURCES = ["chat", "cockpit"] as const;
export type MissionCreationSource = (typeof MISSION_CREATION_SOURCES)[number];

export type MissionIntakeInput = {
  objective: string;
  context: string | null;
  constraints: string | null;
  definitionOfDone: string | null;
  creationSource: MissionCreationSource;
  conversationId: string | null;
  idempotencyKey: string | null;
};

export type MissionIntakeParseResult =
  | { ok: true; input: MissionIntakeInput }
  | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalText(
  value: unknown,
  fieldName: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: `${fieldName} deve ser texto.` };
  }
  const normalized = value.trim();
  return { ok: true, value: normalized || null };
}

export function parseMissionIntake(
  body: unknown,
  headerIdempotencyKey: string | null
): MissionIntakeParseResult {
  if (!isRecord(body)) return { ok: false, error: "Corpo da solicitação inválido." };

  const objective = typeof body.objective === "string" ? body.objective.trim() : "";
  if (objective.length < 3) {
    return {
      ok: false,
      error: "Objetivo da missão é obrigatório (mín. 3 caracteres).",
    };
  }

  const context = parseOptionalText(body.context, "Contexto");
  if (!context.ok) return context;
  const constraints = parseOptionalText(body.constraints, "Restrições");
  if (!constraints.ok) return constraints;
  const definitionOfDone = parseOptionalText(body.definitionOfDone, "Critério de conclusão");
  if (!definitionOfDone.ok) return definitionOfDone;

  const creationSource = body.source ?? body.creationSource ?? "cockpit";
  if (
    typeof creationSource !== "string" ||
    !MISSION_CREATION_SOURCES.includes(creationSource as MissionCreationSource)
  ) {
    return { ok: false, error: "Origem da missão inválida." };
  }

  const rawConversationId = body.conversationId;
  if (
    rawConversationId !== undefined &&
    rawConversationId !== null &&
    (typeof rawConversationId !== "string" || !UUID_PATTERN.test(rawConversationId))
  ) {
    return { ok: false, error: "Identificador da conversa inválido." };
  }
  const conversationId =
    typeof rawConversationId === "string" ? rawConversationId : null;

  const bodyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : null;
  if (body.idempotencyKey !== undefined && body.idempotencyKey !== null && !bodyKey) {
    return { ok: false, error: "Chave idempotente inválida." };
  }
  const headerKey = headerIdempotencyKey?.trim() || null;
  if (headerIdempotencyKey !== null && !headerKey) {
    return { ok: false, error: "Chave idempotente inválida." };
  }
  if (headerKey && bodyKey && headerKey !== bodyKey) {
    return {
      ok: false,
      error: "A chave idempotente do cabeçalho não corresponde ao corpo.",
    };
  }
  const idempotencyKey = headerKey ?? bodyKey;
  if (idempotencyKey && idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return { ok: false, error: "Chave idempotente excede o limite permitido." };
  }

  return {
    ok: true,
    input: {
      objective,
      context: context.value,
      constraints: constraints.value,
      definitionOfDone: definitionOfDone.value,
      creationSource: creationSource as MissionCreationSource,
      conversationId,
      idempotencyKey,
    },
  };
}

export type ExistingMissionIntake = Omit<
  Pick<
    MissionIntakeInput,
    "objective" | "context" | "constraints" | "definitionOfDone" | "creationSource" | "conversationId"
  >,
  "creationSource"
> & { creationSource: string };

/** Refuses reuse of one idempotency key for a materially different mission. */
export function matchesMissionIntake(
  existing: ExistingMissionIntake,
  requested: MissionIntakeInput
): boolean {
  return (
    existing.objective === requested.objective &&
    existing.context === requested.context &&
    existing.constraints === requested.constraints &&
    existing.definitionOfDone === requested.definitionOfDone &&
    existing.creationSource === requested.creationSource &&
    existing.conversationId === requested.conversationId
  );
}
