/**
 * Tutoriais interativos, configuração guiada e diagnóstico visual.
 *
 * Base estrutural: objetivo do usuário → etapas na interface → execução
 * autorizada → verificação. Plano é determinístico e verificável.
 */

import { APP_SURFACES, findSurface, type AppSurface } from "./app-surface";
import type { InteractionStep } from "./ui-perception";

export type GuidedStep = {
  index: number;
  pageId: string;
  instruction: string;
  interaction?: InteractionStep;
  verify?: string;
};

export type GuidedPlan = {
  objective: string;
  steps: GuidedStep[];
  refused?: string;
};

const OBJECTIVE_KEYWORDS: Array<{ match: RegExp; build: (surfaces: AppSurface[]) => Array<Omit<GuidedStep, "index">> }> = [
  {
    match: /conector|integrac|integração|api externa/i,
    build: () => [
      { pageId: "configuracoes", instruction: "Abra Configurações e localize a seção de Conectores." },
      { pageId: "configuracoes", instruction: "Autorize o conector desejado (autenticação é sua, nunca repassada ao chat)." },
      { pageId: "chat", instruction: "Volte ao Chat e peça a tarefa: o conector autorizado entra na visão de capacidades." },
    ],
  },
  {
    match: /autonomia|aprova|gate/i,
    build: () => [
      { pageId: "configuracoes", instruction: "Abra Configurações e localize o modo de autonomia do agente." },
      { pageId: "configuracoes", instruction: "Escolha o modo (padrão eleva atrito de aprovação; total auto-aprova exceto lista de bloqueio)." },
    ],
  },
  {
    match: /modelo|inferência|inferencia|local/i,
    build: () => [
      { pageId: "modelos", instruction: "Abra a vitrine de Modelos e instale ou selecione o modelo desejado." },
      { pageId: "chat", instruction: "No Chat, selecione o modelo (nuvem ou local) na divulgação de modelo." },
    ],
  },
  {
    match: /missão|missao|tarefa|meta/i,
    build: () => [
      { pageId: "chat", instruction: "Descreva o objetivo no Chat; a Nix propõe plano." },
      { pageId: "cockpit", instruction: "Acompanhe execução, evidências e aprovações no Cockpit." },
    ],
  },
];

export function buildGuidedPlan(objective: string): GuidedPlan {
  const obj = String(objective ?? "").trim();
  if (!obj) return { objective: obj, steps: [], refused: "objetivo vazio" };
  for (const rule of OBJECTIVE_KEYWORDS) {
    if (rule.match.test(obj)) {
      const raw = rule.build(APP_SURFACES);
      const steps = raw
        .map((s, i) => {
          const surface = findSurface(s.pageId);
          return {
            index: i + 1,
            pageId: s.pageId,
            instruction: s.instruction,
            verify: surface ? "página " + surface.route + " acessível" : undefined,
          };
        })
        .filter((s) => findSurface(s.pageId) != null);
      return { objective: obj, steps };
    }
  }
  return { objective: obj, steps: [], refused: "nenhum tutorial mapeado para este objetivo ainda" };
}

export type DiagnosticFinding = {
  pageId: string;
  problem: string;
  suggestion: string;
};

/**
 * Diagnóstico visual/estrutural: compara o snapshot declarado da página com
 * o registro (controles ausentes = possível problema de render/estado).
 */
export function diagnosePage(
  pageId: string,
  state: { controls?: Array<{ id: string }>; visibleText?: string }
): { findings: DiagnosticFinding[] } {
  const surface = findSurface(pageId);
  if (!surface) return { findings: [{ pageId, problem: "página desconhecida", suggestion: "verificar rota" }] };
  const present = new Set((state.controls ?? []).map((c) => c.id));
  const findings: DiagnosticFinding[] = [];
  for (const control of surface.controls) {
    if (!present.has(control.id)) {
      findings.push({
        pageId,
        problem: "controle esperado ausente na tela: " + control.label + " (" + control.id + ")",
        suggestion: "verificar renderização/permissões da página " + pageId,
      });
    }
  }
  if (!state.visibleText || state.visibleText.trim().length === 0) {
    findings.push({ pageId, problem: "nenhum texto visível informado", suggestion: "capturar snapshot visual/estruturado" });
  }
  return { findings };
}
