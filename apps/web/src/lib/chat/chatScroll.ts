/**
 * Comportamento de rolagem do chat — helpers puros e testaveis.
 *
 * Regras do produto:
 * - Acompanhando o fim: novas mensagens permanecem visíveis (stick to bottom).
 * - Lendo mensagens antigas: o chat NUNCA força rolagem automática.
 * - Ao sair de uma conversa, a posição de rolagem é preservada e restaurada
 *   no retorno (sessionStorage por conversa).
 */

export const NEAR_BOTTOM_THRESHOLD_PX = 72;
const STORAGE_PREFIX = "plutao.chat.scroll.";

export function isNearBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  threshold: number = NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  if (scrollHeight <= 0 || clientHeight <= 0) return true;
  return scrollHeight - scrollTop - clientHeight < threshold;
}

export function shouldShowJumpToLatest(
  nearBottom: boolean,
  scrollHeight: number,
  clientHeight: number,
): boolean {
  return !nearBottom && scrollHeight > clientHeight;
}

type MinimalStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

function storageKey(conversationId: string): string {
  return STORAGE_PREFIX + conversationId;
}

/** Salva a posição de rolagem de uma conversa (best-effort, silencioso). */
export function saveChatScrollPosition(
  conversationId: string,
  top: number,
  storage: MinimalStorage | null = typeof sessionStorage !== "undefined" ? sessionStorage : null,
): void {
  if (!conversationId || !storage || !Number.isFinite(top)) return;
  try {
    storage.setItem(storageKey(conversationId), String(Math.max(0, Math.round(top))));
  } catch {
    /* storage cheio/indisponível: best-effort */
  }
}

/** Restaura a posição salva (null se não houver). */
export function loadChatScrollPosition(
  conversationId: string,
  storage: MinimalStorage | null = typeof sessionStorage !== "undefined" ? sessionStorage : null,
): number | null {
  if (!conversationId || !storage) return null;
  try {
    const raw = storage.getItem(storageKey(conversationId));
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

/** Limpa posições salvas (ex.: conversa excluída). */
export function clearChatScrollPositions(
  conversationIds: string[],
  storage: MinimalStorage | null = typeof sessionStorage !== "undefined" ? sessionStorage : null,
): void {
  if (!storage) return;
  for (const id of conversationIds) {
    try {
      storage.removeItem?.(storageKey(id));
    } catch {
      /* ignore */
    }
  }
}
