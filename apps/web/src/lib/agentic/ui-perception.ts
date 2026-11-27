/**
 * Percepção e interação com a interface do Plutão.
 *
 * Prioriza informação estruturada/semântica (registro de superfícies + estado
 * declarado do cliente); a percepção visual é um complemento plugável.
 * A execução de interações acontece via portas (executors) autorizadas — o
 * Computador, quando retomado, implementa a mesma porta para interfaces
 * externas. Nada de coordenadas fixas como base.
 *
 * Regras de segurança de interação:
 * - Resolução EXPLÍCITA do controle-alvo: ao mencionar um controle, somente
 *   ele é alterado; controles ambíguos ou não identificáveis recusam a ação
 *   (pede esclarecimento ao usuário) em vez de alterar múltiplos controles.
 * - Digitação SEM texto definido é recusada (nunca limpa o campo).
 * - Seleção de select exige valor exato de opção (sem aproximação).
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
      state?.visibleText
        ? "texto visível informado pelo cliente: " + JSON.stringify(state.visibleText.slice(0, 220))
        : "sem texto visual informado",
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

/** O objetivo menciona este controle? (id ou palavras do rótulo) */
function controlMentioned(control: SurfaceControl, goalLower: string): boolean {
  const idTail = (control.id.split(".").pop() ?? "").toLowerCase();
  if (idTail.length > 3 && goalLower.includes(idTail)) return true;
  return control.label
    .toLowerCase()
    .split(/[\s,]+/)
    .some((w) => w.length > 3 && goalLower.includes(w));
}

export type TargetResolution =
  | { ok: true; control: SurfaceControl }
  | { ok: false; reason: string };

/**
 * Resolução SEGURA do controle-alvo: somente UM controle. Se o objetivo
 * menciona exatamente um controle compatível, ele é o alvo; se menciona
 * mais de um, é ambíguo (recusa); se não menciona nenhum, só aceita quando
 * existe EXATAMENTE um candidato na página — caso contrário, recusa pedindo
 * esclarecimento.
 */
export function resolveTargetControl(
  surface: AppSurface,
  goalLower: string,
  kinds?: Array<SurfaceControl["kind"]>
): TargetResolution {
  const pool = surface.controls.filter((c) =>
    kinds ? kinds.includes(c.kind) : c.kind === "toggle" || c.kind === "select"
  );
  if (pool.length === 0) return { ok: false, reason: "nenhum controle compatível na página" };
  const mentioned = pool.filter((c) => controlMentioned(c, goalLower));
  if (mentioned.length > 1) {
    return {
      ok: false,
      reason: "controles ambíguos para este comando (" + mentioned.map((c) => c.id).join(", ") + "); especifique qual controle alterar",
    };
  }
  if (mentioned.length === 1) return { ok: true, control: mentioned[0] };
  if (pool.length === 1) return { ok: true, control: pool[0] };
  return {
    ok: false,
    reason: "não foi possível identificar o controle com segurança; especifique o nome do controle",
  };
}

export type InteractionAction =
  | { type: "click"; control: string }
  | { type: "toggle"; control: string; to: boolean }
  | { type: "type"; control: string; text: string }
  | { type: "select"; control: string; value: string }
  | { type: "navigate"; route: string };

export type InteractionStep = {
  action: InteractionAction;
  instruction: string;
  sensitive?: boolean;
  verify?: { control?: string; expect?: string };
};

/** Expectativa de estado pós-ação (para verificação real no cliente). */
export type StateExpectation = { id: string; expect: string | boolean | number };

/**
 * Verificação REAL pós-ação: compara o estado observado (snapshot do DOM)
 * com o esperado. Estados ausentes são "unverifiable" (não confirmado);
 * divergências são listadas em mismatches. Sucesso só é anunciado quando
 * todas as expectativas são confirmadas.
 */
export function verifyInteractionExpectations(
  expectations: StateExpectation[],
  observed: Array<{ id: string; state?: string | boolean | number }>
): { ok: boolean; mismatches: string[]; unverifiable: string[] } {
  const byId = new Map(observed.map((o) => [o.id, o.state]));
  const mismatches: string[] = [];
  const unverifiable: string[] = [];
  for (const e of expectations) {
    if (!byId.has(e.id) || byId.get(e.id) === undefined) {
      unverifiable.push(e.id);
      continue;
    }
    const actual = byId.get(e.id);
    if (actual !== e.expect) {
      mismatches.push(e.id + ": esperado " + JSON.stringify(e.expect) + ", observado " + JSON.stringify(actual));
    }
  }
  return { ok: mismatches.length === 0 && unverifiable.length === 0, mismatches, unverifiable };
}

function extractQuoted(goal: string): string {
  const m = goal.match(/\bcom\s+["“](.+?)["”]/);
  return m ? m[1] : "";
}

/**
 * Plano de interação estruturado (não coordenadas). Toggles sensíveis
 * exigem confirmação humana explícita. Digitação sem texto e seleção sem
 * valor exato são RECUSADAS (pedem esclarecimento) em vez de executadas.
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

  const selectWords = /(selecione|escolha|defina)/;
  if (selectWords.test(goalLower)) {
    const value = extractQuoted(goal) || goal.match(/\bpara\s+["“](.+?)["”]/i)?.[1] || "";
    if (!value) {
      return { steps: [], refused: "valor da opção não especificado; pergunte ao usuário qual opção exata selecionar" };
    }
    const target = resolveTargetControl(surface, goalLower, ["select"]);
    if (!target.ok) return { steps: [], refused: target.reason };
    steps.push({
      action: { type: "select", control: target.control.id, value },
      instruction: "Selecionar a opção exata \"" + value + "\" em " + target.control.label,
      sensitive: target.control.sensitive,
      verify: { control: target.control.id, expect: value },
    });
    return { steps };
  }

  const typeWords = /(escreva|digite|preencha)/;
  if (typeWords.test(goalLower)) {
    const text = extractQuoted(goal);
    if (!text) {
      return { steps: [], refused: "texto a digitar não especificado; pergunte ao usuário (ação recusada para não limpar o campo)" };
    }
    const inputKinds: Array<SurfaceControl["kind"]> = ["input", "search", "textarea"];
    const inputPool = surface.controls.filter((c) => inputKinds.includes(c.kind));
    const resolved = resolveTargetControl(surface, goalLower, inputKinds);
    let inputControl: SurfaceControl | null;
    if (resolved.ok) inputControl = resolved.control;
    else if (inputPool.length > 1) return { steps: [], refused: resolved.reason };
    else inputControl = inputPool[0] ?? null;
    if (!inputControl) return { steps: [], refused: "nenhum campo de entrada na página " + pageId };
    steps.push({
      action: { type: "type", control: inputControl.id, text },
      instruction: "Digitar no campo " + inputControl.label + " preservando o texto exato informado",
      verify: { control: inputControl.id, expect: text },
    });
    return { steps };
  }

  const toggleWords = /(desativ|ativ|ligue|desligue|habilite|desabilite|marc|desmarc)/;
  const stateWords = /(está|esta|ativad|desativad|ligad|habilitad)/;
  if (toggleWords.test(goalLower)) {
    const target = resolveTargetControl(surface, goalLower);
    if (!target.ok) return { steps: [], refused: target.reason };
    const to = !/desativ|deslig|desabil|desmarc/.test(goalLower);
    steps.push({
      action: { type: "toggle", control: target.control.id, to },
      instruction: (to ? "Ativar " : "Desativar ") + target.control.label,
      sensitive: target.control.sensitive,
      verify: { control: target.control.id, expect: to ? "ativado" : "desativado" },
    });
    return { steps };
  }
  if (stateWords.test(goalLower)) {
    const target = resolveTargetControl(surface, goalLower);
    if (!target.ok) return { steps: [], refused: target.reason };
    steps.push({
      action: { type: "click", control: target.control.id },
      instruction: "Verificar estado de " + target.control.label,
      verify: { control: target.control.id },
    });
    return { steps };
  }

  return { steps: [], refused: "objetivo não mapeado para controles da página " + pageId };
}

const APP_SURFACE_ROUTES: Array<{ pageId: string; route: string }> = [
  { pageId: "chat", route: "/chat" },
  { pageId: "cockpit", route: "/cockpit" },
  { pageId: "configuracoes", route: "/configuracoes" },
  { pageId: "modelos", route: "/modelos" },
  { pageId: "planos", route: "/planos" },
  { pageId: "artemis", route: "/artemis" },
  { pageId: "ajuda", route: "/ajuda" },
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