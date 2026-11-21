/**
 * Regras puras da criação automática de missão a partir do chat.
 * Sem dependências de banco — testável isoladamente.
 */

const MAX_OBJECTIVE_LENGTH = 200;

/** Verbos de construção (pt/en). */
const BUILD_VERB =
  /\b(crie|criar|cria|construa|construir|constr[óo]i|desenvolva|desenvolver|desenvolve|fa[çc]a|fazer|monte|montar|gere|gerar|implemente|implementar|quero um|quero uma|preciso de um|preciso de uma)\b/i;

/** Entregáveis de software detectáveis. */
const BUILD_NOUN =
  /\b(site|website|aplica[çc][ãa]o|aplicativo|app|sistema|p[áa]gina|landing|dashboard|loja|blog|api|plataforma|portal|extens[ãa]o|bot|automa[çc][ãa]o|crud|saas)\b/i;

/** Pedidos que NÃO devem virar missão durável (consulta/análise). */
const NON_BUILD =
  /\b(an[áa]lis|expliqu|revi|rev[êe]|ideias|resum|opini|compar|pesquis)/i;

export const MAX_CHAT_OBJECTIVE_LENGTH = MAX_OBJECTIVE_LENGTH;

export function detectBuildIntent(userText: string): boolean {
  const clean = (userText ?? "").trim();
  if (clean.length < 8 || clean.length > 800) return false;
  if (NON_BUILD.test(clean)) return false;
  return BUILD_VERB.test(clean) && BUILD_NOUN.test(clean);
}

const AFFIRMATIVE =
  /^(sim|ok|okay|beleza|blz|pode\s?sim|pode|vai|segue|seguir|prossegue|prossiga|confirmo|confirmado|aprovado|fa[çc]a|cria|crie|executa|executar|manda)([\s,]+.*)?$/i;

export function detectAffirmativeConfirmation(userText: string): boolean {
  const clean = (userText ?? "").trim();
  if (clean.length === 0 || clean.length > 60) return false;
  return AFFIRMATIVE.test(clean);
}

export function hasNumberedPlan(text: string): boolean {
  const hits = (text ?? "").match(/(^|\n)\s*[1-9][.)]\s+\S/g);
  return Boolean(hits && hits.length >= 3);
}

export function pickObjective(
  history: Array<{ role: string; content: string }>,
  userText: string
): string {
  const messages = [
    userText,
    ...[...(history ?? [])]
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .reverse(),
  ];
  for (const c of messages) {
    const t = (c ?? "").trim();
    if (t.length >= 15 && t.length <= 400 && BUILD_NOUN.test(t)) {
      return t.slice(0, MAX_OBJECTIVE_LENGTH);
    }
  }
  const fallback = (userText ?? "").trim().slice(0, MAX_OBJECTIVE_LENGTH);
  return fallback || "Missão criada pelo chat";
}

function djb2(input: string): string {
  let h = 5381;
  for (let i = 0; i < (input ?? "").length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

export function buildChatAutoIdempotencyKey(conversationId: string, objective: string): string {
  return "chat-auto-" + djb2(conversationId) + "-" + djb2(objective);
}
