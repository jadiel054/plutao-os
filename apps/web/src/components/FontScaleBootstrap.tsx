"use client";

import { useEffect } from "react";

type FontScale = "small" | "default" | "large" | "xlarge";

const multipliers: Record<FontScale, string> = {
  small: "0.9",
  default: "1",
  large: "1.12",
  xlarge: "1.25",
};

export function applyFontScale(value: FontScale) {
  document.documentElement.style.setProperty("--plutao-font-scale", multipliers[value]);
  document.documentElement.dataset.fontScale = value;
}

export function FontScaleBootstrap() {
  useEffect(() => {
    let cancelled = false;
    const cached = localStorage.getItem("plutao_pref_appearance");
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { fontScale?: FontScale };
        if (parsed.fontScale && parsed.fontScale in multipliers) applyFontScale(parsed.fontScale);
      } catch {
        /* ignore malformed local cache */
      }
    }

    void fetch("/api/user/preferences", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data: { preferences?: { appearance?: { fontScale?: FontScale } } } | null) => {
        if (cancelled) return;
        const value = data?.preferences?.appearance?.fontScale;
        if (value && value in multipliers) {
          applyFontScale(value);
          localStorage.setItem("plutao_pref_appearance", JSON.stringify({ fontScale: value }));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
