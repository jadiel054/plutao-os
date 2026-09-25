"use client";

import { useEffect } from "react";
import { migrateGuestChatLocalStorage } from "@/lib/auth/migrateGuestChatLocalStorage";

const RELOAD_FLAG = "plutao_guest_chat_migrated_reload";

/**
 * BUG-03: quando o header recebe e-mail autenticado (não guest),
 * migra transcript localStorage guest→user. Se migrou e o chat pode
 * já ter lido a chave antiga vazia, recarrega uma vez no mesmo browser.
 */
export function GuestChatMigrate({ email, isGuest }: { email?: string; isGuest?: boolean }) {
  useEffect(() => {
    if (!email || isGuest) return;
    if (email === "guest@plutao.ai") return;
    const migrated = migrateGuestChatLocalStorage(email);
    if (!migrated) return;
    try {
      if (sessionStorage.getItem(RELOAD_FLAG) === email) return;
      sessionStorage.setItem(RELOAD_FLAG, email);
    } catch {
      /* ignore */
    }
    window.location.reload();
  }, [email, isGuest]);
  return null;
}
