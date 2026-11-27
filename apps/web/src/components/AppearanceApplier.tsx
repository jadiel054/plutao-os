"use client";

import { useEffect } from "react";

type AppearancePrefs = {
  theme?: "dark" | "light" | "system";
  density?: "comfortable" | "compact";
  language?: "pt-BR" | "en-US";
  fontScale?: "small" | "default" | "large" | "xlarge";
};

function readPrefs(): AppearancePrefs {
  try {
    const raw = localStorage.getItem("plutao_pref_appearance");
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === "object" && p !== null ? p : {};
  } catch {
    return {};
  }
}

function apply(p: AppearancePrefs) {
  const root = document.documentElement;
  const theme = p.theme === "light" || p.theme === "dark" || p.theme === "system" ? p.theme : "dark";
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : theme;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-density", p.density === "compact" ? "compact" : "comfortable");
  root.lang = p.language === "en-US" ? "en-US" : "pt-BR";
}

/**
 * Aplica as preferências de aparência (tema, densidade, idioma) em TODO o app,
 * reagindo a mudanças salvas em outra aba e ao esquema do sistema.
 * Complementa o FontScaleBootstrap (escala de fonte).
 */
export function AppearanceApplier() {
  useEffect(() => {
    apply(readPrefs());
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === "plutao_pref_appearance") apply(readPrefs());
    };
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const onScheme = () => {
      if (readPrefs().theme === "system") apply(readPrefs());
    };
    window.addEventListener("storage", onStorage);
    mql.addEventListener("change", onScheme);
    return () => {
      window.removeEventListener("storage", onStorage);
      mql.removeEventListener("change", onScheme);
    };
  }, []);
  return null;
}
