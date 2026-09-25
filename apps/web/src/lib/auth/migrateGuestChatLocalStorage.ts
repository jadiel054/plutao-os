/**
 * BUG-03 torniquete (client-only): após guest→user no mesmo browser,
 * copia transcript localStorage da chave guest para a chave do e-mail real.
 * Não sobrescreve destino se já existir. Limpa a chave guest só após copiar.
 */
export const GUEST_CHAT_EMAIL = "guest@plutao.ai";

export function guestChatStorageKey(email: string): string {
  return `plutao_chat_${email}`;
}

export function migrateGuestChatLocalStorage(realEmail: string): boolean {
  if (typeof window === "undefined") return false;
  const email = (realEmail || "").trim().toLowerCase();
  if (!email || email === GUEST_CHAT_EMAIL) return false;

  const fromKey = guestChatStorageKey(GUEST_CHAT_EMAIL);
  const toKey = guestChatStorageKey(email);

  try {
    const origin = localStorage.getItem(fromKey);
    if (!origin) return false;

    const dest = localStorage.getItem(toKey);
    if (dest == null || dest === "") {
      localStorage.setItem(toKey, origin);
    }
    localStorage.removeItem(fromKey);
    return true;
  } catch {
    return false;
  }
}
