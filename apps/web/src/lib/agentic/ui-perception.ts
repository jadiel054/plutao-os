/**
 * Percepção e interação com a interface do Plutão.
 *
 * Prioriza informação estruturada/semântica (registro de superfícies + estado
 * declarado do cliente); a percepção visual é um complemento plugável.
 * A execução de interações acontece via portas (executors) autorizadas — o
 * Computador, quando retomado, implementa a mesma porta para interfaces
 * externas. Nada de coordenadas fixas como base.
 */

import { findSurface, type AppSurface, type SurfaceControl } from "./app-surface";

/** Estado declarado de uma página, fornecido pelo cliente (estruturado). */
export type PageState = {
  pageId: string;
  route?: string;
  title?: string;
  visibleText?: string;
  controls?: Array<{ id: string; state?: string | boolean | number }>;
};

export type PageDescription = {
  pageId: string;
  purpose: string;
  route: string;
  controls: Array<{ id: string; label: string; kind: string; state?: string | boolean | number }>;
  notes: string[];
};

/** Lê e compreende o que está na tela: registro + estado real declarado. */
export function describePage(pageIdOrRoute: string, state?: PageState): PageDescription | null {
  const surface = findSurface(pageIdOrRoute);
  if (!surface) return null;
  const stateById = new Map((state?.controls ?? []).map((c) => [c.id, c.state]));
  return {
    pageId: surface.pageId,
    purpose: surface.purpose,
    route: surface.route,
    controls: surface.controls.map((c) => ({
      id: c.id,
      label: c.label,
      kind: c.kind,
      state: stateById.get(c.id),
    })),
    notes: [
      state?.visibleText ? "texto visível informado pelo cliente (" + state.visibleText.length + " chars)" : "sem texto visual informado",
    ],
  };
}

export function findControl(pageId: string, query: string): SurfaceControl | null {
  const surface = findSurface(pageId);
  if (!surface) return null;
  const q = query.toLowerCase();
  return (
    surface.controls.find((c) => c.id.toLowerCase() === q) ??
    surface.controls.find((c) => c.label.toLowerCase().includes(q)) ??
    surface.controls.find((c) => c.id.toLowerCase().includes(q)) ??
    null
  );
}

export type InteractionAction =
  | { type: "click"; control: string }
  | { type: "toggle"; control: string; to: boolean }
  | { type: "type"; control: string; text: string }
  | { type: "navigate"; route: string };

export type InteractionStep = {
  action: InteractionAction;
  instruction: string;
  sensitive?: boolean;
  verify?: { control?: string; expect?: string };
};

/**
 * Plano de interação estruturado (não coordenadas). Toggles sensíveis
 * exigem confirmação humana explícita.
 */
export function planInteraction(pageId: string, goal: string): { steps: InteractionStep[]; refused?: string } {
  const surface = findSurface(pageId);
  if (!surface) return { steps: [], refused: "página desconhecida para o núcleo: " + pageId };
  const goalLower = goal.toLowerCase();
  const steps: InteractionStep[] = [];

  const navMatch = APP_SURFACE_ROUTES.find((r) => goalLower.includes(r.pageId));
  if (navMatch && goalLower.match(/abra|abrir|vá para|va para|volte|navegue/)) {
    steps.push({
      action: { type: "navigate", route: navMatch.route },
      instruction: "Navegar para " + navMatch.route,
      verify: { expect: "rota " + navMatch.route + " carregada" },
    });
    return { steps };
  }

  const toggleWords = /(desativ|ativ|ligue|desligue|habilite|desabilite|marc|desmarc)/;
  const stateWords = /(está|esta|ativad|desativad|ligad|habilitad)/;
  for (const control of surface.controls) {
    if (control.kind === "toggle" && toggleWords.test(goalLower)) {
      const to = !/desativ|deslig|desabil|desmarc/.test(goalLower);
      steps.push({
        action: { type: "toggle", control: control.id, to },
        instruction: (to ? "Ativar " : "Desativar ") + control.label,
        sensitive: control.sensitive,
        verify: { control: control.id, expect: to ? "ativado" : "desativado" },
      });
    } else if (stateWords.test(goalLower) && (control.kind === "toggle" || control.kind === "select")) {
      steps.push({
        action: { type: "click", control: control.id },
        instruction: "Verificar estado de " + control.label,
        verify: { control: control.id },
      });
    }
  }
  if (steps.length === 0) {
    return { steps: [], refused: "objetivo não mapeado para controles da página " + pageId };
  }
  return { steps };
}

const APP_SURFACE_ROUTES: Array<{ pageId: string; route: string }> = [
  { pageId: "chat", route: "/chat" },
  { pageId: "cockpit", route: "/cockpit" },
  { pageId: "configuracoes", route: "/configuracoes" },
  { pageId: "modelos", route: "/modelos" },
  { pageId: "planos", route: "/planos" },
  { pageId: "artemis", route: "/artemis" },
];

/**
 * Porta de execução de interação. Implementações atuais: cliente do próprio
 * app (NixVoiceAssist). Futura: Computador (interfaces externas).
 */
export interface InteractionExecutor {
  execute(step: InteractionStep): Promise<{ ok: boolean; observed?: string; error?: string }>;
}

export type InteractionOutcome = {
  completed: boolean;
  results: Array<{ step: InteractionStep; ok: boolean; observed?: string; error?: string }>;
  refused?: string;
};

/**
 * Executa interações autorizadas com verificação pós-ação. Etapas sensíveis
 * exigem confirmed=true (autorização humana explícita nesta chamada).
 */
export async function executeInteraction(
  pageId: string,
  steps: InteractionStep[],
  executor: InteractionExecutor,
  opts: { confirmed?: boolean } = {}
): Promise<InteractionOutcome> {
  const results: InteractionOutcome["results"] = [];
  for (const step of steps) {
    if (step.sensitive && !opts.confirmed) {
      return {
        completed: false,
        results,
        refused: "controle sensível exige confirmação humana explícita: " + step.instruction,
      };
    }
    const r = await executor.execute(step);
    let ok = r.ok;
    if (ok && step.verify?.expect) {
      ok = (r.observed ?? "").includes(step.verify.expect);
    }
    results.push({ step, ok, observed: r.observed, error: r.error });
    if (!ok) {
      return { completed: false, results, refused: "verificação pós-ação falhou: " + step.instruction };
    }
  }
  return { completed: true, results };
}
