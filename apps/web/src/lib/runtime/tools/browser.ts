import { sanitizeText } from "@/lib/security/sanitize";

export const BROWSER_MAX_URL_LENGTH = 2_048;
export const BROWSER_MAX_STEPS = 20;
const SAFE_PROTOCOLS = new Set(["https:", "http:"]);
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export type BrowserAction =
  | { type: "navigate"; url: string }
  | { type: "extract"; selector: string; attribute?: string }
  | { type: "screenshot" }
  | { type: "wait"; milliseconds: number };

export type BrowserDecision =
  | { allowed: true; action: BrowserAction; target?: URL }
  | { allowed: false; code: string; message: string };

export function validateBrowserUrl(raw: string): URL | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > BROWSER_MAX_URL_LENGTH) return null;
  try {
    const url = new URL(raw);
    if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
    if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function planBrowserAction(action: BrowserAction, stepCount: number): BrowserDecision {
  if (!Number.isInteger(stepCount) || stepCount < 0 || stepCount >= BROWSER_MAX_STEPS) {
    return { allowed: false, code: "BROWSER_STEP_LIMIT", message: "Limite de passos do browser atingido" };
  }
  if (action.type === "navigate") {
    const target = validateBrowserUrl(action.url);
    if (!target) {
      return { allowed: false, code: "BROWSER_URL_BLOCKED", message: "URL bloqueada pela política de navegação" };
    }
    return { allowed: true, action: { ...action, url: target.toString() }, target };
  }
  if (action.type === "extract") {
    const selector = sanitizeText(action.selector).trim();
    if (!selector || selector.length > 300 || /[{}<>]/.test(selector)) {
      return { allowed: false, code: "BROWSER_SELECTOR_BLOCKED", message: "Seletor inválido" };
    }
    const attribute = action.attribute ? sanitizeText(action.attribute).trim() : undefined;
    if (attribute && !/^[a-zA-Z_:][\w:.-]*$/.test(attribute)) {
      return { allowed: false, code: "BROWSER_ATTRIBUTE_BLOCKED", message: "Atributo inválido" };
    }
    return { allowed: true, action: { type: "extract", selector, attribute } };
  }
  if (action.type === "wait") {
    if (!Number.isInteger(action.milliseconds) || action.milliseconds < 0 || action.milliseconds > 10_000) {
      return { allowed: false, code: "BROWSER_WAIT_BLOCKED", message: "Espera fora do limite permitido" };
    }
    return { allowed: true, action };
  }
  return { allowed: true, action };
}

/** V1 não executa browser: retorna plano seguro até existir backend isolado + approval gate. */
export function browserCapabilityStatus() {
  return {
    enabled: false as const,
    backend: null,
    reason: "BROWSER_BACKEND_NOT_CONFIGURED",
    writeActionsRequireApproval: true,
  };
}
