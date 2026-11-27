"use client";

import { useEffect } from "react";
import {
  applyFontScale,
  isFontScale,
  readAppearancePrefs,
  writeAppearancePrefs,
  type FontScale,
} from "@/lib/appearance";

export { applyFontScale } from "@/lib/appearance";

/**
 * Bootstrap da escala de fonte. A gravação usa writeAppearancePrefs, que MESCLA
 * com as preferências existentes: tema claro, densidade compacta e idioma não
 * são perdidos (antes, gravava apenas { fontScale }).
 */
export function FontScaleBootstrap() {
  useEffect(() => {
    let cancelled = false;
    const cached = readAppearancePrefs();
    if (cached.fontScale && isFontScale(cached.fontScale)) applyFontScale(cached.fontScale);

    void fetch("/api/user/preferences", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data: { preferences?: { appearance?: { fontScale?: FontScale } } } | null) => {
        if (cancelled) return;
        const value = data?.preferences?.appearance?.fontScale;
        if (value && isFontScale(value)) {
          applyFontScale(value);
          writeAppearancePrefs({ fontScale: value }); // merge, preserva os demais campos
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
