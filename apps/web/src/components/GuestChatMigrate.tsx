"use client";

import { useEffect } from "react";
import { migrateGuestChatLocalStorage } from "@/lib/auth/migrateGuestChatLocalStorage";

/** BUG-03: roda no client quando o header conhece o e-mail autenticado (não guest). */
export function GuestChatMigrate({ email, isGuest }: { email?: string; isGuest?: boolean }) {
  useEffect(() => {
    if (!email || isGuest) return;
    if (email === "guest@plutao.ai") return;
    migrateGuestChatLocalStorage(email);
  }, [email, isGuest]);
  return null;
}
