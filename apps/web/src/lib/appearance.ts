/**
 * Mecanismo ÚNICO de preferências/aplicação de aparência.
 *
 * Problema original: o evento "storage" não dispara na mesma aba que grava, e o
 * FontScaleBootstrap sobrescrevia "plutao_pref_appearance" com apenas
 * { fontScale }, apagando tema, densidade e idioma.
 *
 * Solução: leitura/escrita SEMPRE por aqui. A escrita mescla com as preferências
 * existentes (nada é perdido), aplica imediatamente no documentElement e dispara
 * um CustomEvent na mesma aba (o "storage" cobre as outras abas).
 */

export const APPEARANCE_KEY = "plutao_pref_appearance";
export const APPEARANCE_CHANGED_EVENT = "plutao:appearance-changed";

export type ThemeMode = "dark" | "light" | "system";
export type Density = "comfortable" | "compact";
export type Language = "pt-BR" | "en-US";
export type FontScale = "small" | "default" | "large" | "xlarge";

export const FONT_SCALES: FontScale[] = ["small", "default", "large", "xlarge"];

export type AppearancePrefs = {
  theme?: ThemeMode;
  density?: Density;
  language?: Language;
  fontScale?: FontScale;
};

const FONT_MULTIPLIERS: Record<FontScale, string> = {
  small: "0.9",
  default: "1",
  large: "1.12",
  xlarge: "1.25",
};

function isTheme(v: unknown): v is ThemeMode { return v === "dark" || v === "light" || v === "system"; }
function isDensity(v: unknown): v is Density { return v === "comfortable" || v === "compact"; }
function isLanguage(v: unknown): v is Language { return v === "pt-BR" || v === "en-US"; }
export function isFontScale(v: unknown): v is FontScale {
  return typeof v === "string" && (FONT_SCALES as string[]).includes(v);
}

/** Mescla pura e validada: campos do partial sobrescrevem; os demais são preservados. */
export function mergeAppearance(
  existing: unknown,
  partial: Partial<AppearancePrefs>,
): AppearancePrefs {
  const base = (existing && typeof existing === "object" ? existing : {}) as AppearancePrefs;
  const next: AppearancePrefs = { ...base };
  if (partial.theme !== undefined && isTheme(partial.theme)) next.theme = partial.theme;
  if (partial.density !== undefined && isDensity(partial.density)) next.density = partial.density;
  if (partial.language !== undefined && isLanguage(partial.language)) next.language = partial.language;
  if (partial.fontScale !== undefined && isFontScale(partial.fontScale)) next.fontScale = partial.fontScale;
  return next;
}

export function readAppearancePrefs(): AppearancePrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === "object" && p !== null ? p : {};
  } catch {
    return {};
  }
}

export function applyAppearancePrefs(p: AppearancePrefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = isTheme(p.theme) ? p.theme : "dark";
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
      : theme;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-density", p.density === "compact" ? "compact" : "comfortable");
  root.lang = p.language === "en-US" ? "en-US" : "pt-BR";
  if (p.fontScale && isFontScale(p.fontScale)) applyFontScale(p.fontScale);
}

export function applyFontScale(value: FontScale): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--plutao-font-scale", FONT_MULTIPLIERS[value]);
  document.documentElement.dataset.fontScale = value;
}

/**
 * Escrita canônica: mescla com o que já existe (preserva tema/densidade/idioma),
 * persiste, aplica imediatamente e avisa a MESMA aba via CustomEvent.
 */
export function writeAppearancePrefs(partial: Partial<AppearancePrefs>): AppearancePrefs {
  const next = mergeAppearance(readAppearancePrefs(), partial);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
    } catch { /* ignore storage error */ }
    applyAppearancePrefs(next);
    window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGED_EVENT, { detail: next }));
  }
  return next;
}
