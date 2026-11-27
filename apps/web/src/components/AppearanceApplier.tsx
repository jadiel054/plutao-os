"use client";

import { useEffect } from "react";
import {
  APPEARANCE_CHANGED_EVENT,
  APPEARANCE_KEY,
  applyAppearancePrefs,
  readAppearancePrefs,
} from "@/lib/appearance";

/**
 * Aplica as preferências de aparência em TODO o app.
 * Reage a: carga inicial, evento custom na MESMA aba (o "storage" não dispara
 * na aba que grava), evento "storage" de outras abas e esquema do sistema.
 */
export function AppearanceApplier() {
  useEffect(() => {
    applyAppearancePrefs(readAppearancePrefs());
    const onSameTab = () => applyAppearancePrefs(readAppearancePrefs());
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === APPEARANCE_KEY) applyAppearancePrefs(readAppearancePrefs());
    };
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const onScheme = () => {
      if (readAppearancePrefs().theme === "system") applyAppearancePrefs(readAppearancePrefs());
    };
    window.addEventListener(APPEARANCE_CHANGED_EVENT, onSameTab);
    window.addEventListener("storage", onStorage);
    mql.addEventListener("change", onScheme);
    return () => {
      window.removeEventListener(APPEARANCE_CHANGED_EVENT, onSameTab);
      window.removeEventListener("storage", onStorage);
      mql.removeEventListener("change", onScheme);
    };
  }, []);
  return null;
}
