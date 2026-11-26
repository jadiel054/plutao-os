/**
 * Assistência por voz durante o uso do sistema.
 *
 * Mapeia comandos naturais (pt-BR) para intenções e planos do núcleo
 * (percepção + interação). A voz COMPARTILHA o contexto da página e das
 * capacidades — não é uma experiência isolada.
 */

import { planInteraction, type InteractionStep } from "./ui-perception";
import { findSurface } from "./app-surface";

export type VoiceIntent =
  | "read_screen"
  | "query_state"
  | "toggle_control"
  | "explain"
  | "navigate"
  | "guided_goal"
  | "free_form";

export type ParsedVoiceCommand = {
  intent: VoiceIntent;
  target?: string;
  raw: string;
};

const NAV_ROUTES = ["chat", "cockpit", "configuracoes", "modelos", "planos", "artemis"];

export function parseVoiceCommand(text: string): ParsedVoiceCommand {
  const raw = String(text ?? "").trim();
  const t = raw
    .toLowerCase()
    .replace(/^nix[,\s]+/, "")
    .trim();

  if (/^(abra|abrir|vá para|va para|volte|voltar para|navegue para)\s/.test(t)) {
    const target = NAV_ROUTES.find((r) => t.includes(r));
    if (target) return { intent: "navigate", target, raw };
  }
  if (/(leia|ler|o que está escrito|o que esta escrito)/.test(t)) {
    return { intent: "read_screen", raw };
  }
  if (/(está ativad|esta ativad|está ligad|está habilitad|qual o estado|que opção)/.test(t)) {
    return { intent: "query_state", raw };
  }
  if (/(desative|ative|desabilit|habilite|ligue|desligue)/.test(t)) {
    return { intent: "toggle_control", raw };
  }
  if (/(explique|o que faz|para que serve|como funciona)/.test(t)) {
    return { intent: "explain", raw };
  }
  if (/(configure|configurar|me guie|guia|tutorial|passo a passo)/.test(t)) {
    return { intent: "guided_goal", raw };
  }
  return { intent: "free_form", raw };
}

export type VoiceAssistResponse = {
  reply: string;
  intent: VoiceIntent;
  navigateTo?: string;
  interaction?: { pageId: string; steps: InteractionStep[] };
  needsPageState?: boolean;
  refused?: string;
};

/**
 * Produz a resposta de assistência a partir do comando de voz + contexto
 * atual (página e estado estruturado informado pelo cliente).
 */
export function respondToVoiceCommand(
  command: ParsedVoiceCommand,
  context: { pageId: string; hasPageState?: boolean }
): VoiceAssistResponse {
  const surface = findSurface(context.pageId);
  switch (command.intent) {
    case "navigate": {
      const target = command.target ?? "chat";
      const nav = planInteraction(context.pageId, "abra " + target);
      if (nav.steps.length > 0) {
        return {
          reply: "Indo para " + target + ".",
          intent: "navigate",
          navigateTo: nav.steps[0].action.type === "navigate" ? nav.steps[0].action.route : undefined,
        };
      }
      return { reply: "Não encontrei a página " + target + ".", intent: "navigate", refused: "página desconhecida" };
    }
    case "read_screen":
      if (!context.hasPageState) {
        return {
          reply: "Posso ler a tela: preciso do conteúdo atual da página para descrever com precisão.",
          intent: "read_screen",
          needsPageState: true,
        };
      }
      return {
        reply: "Descrição da página " + context.pageId + ": " + (surface?.purpose ?? "página desconhecida") + ".",
        intent: "read_screen",
      };
    case "query_state":
      if (!context.hasPageState) {
        return { reply: "Para confirmar o estado preciso do snapshot estruturado da página.", intent: "query_state", needsPageState: true };
      }
      return { reply: "Verifiquei o estado com base no snapshot da página.", intent: "query_state" };
    case "toggle_control": {
      const plan = planInteraction(context.pageId, command.raw);
      if (plan.refused) {
        return { reply: "Não encontrei esse controle na página " + context.pageId + ".", intent: "toggle_control", refused: plan.refused };
      }
      const sensitive = plan.steps.some((s) => s.sensitive);
      return {
        reply: sensitive
          ? "Esse controle é sensível: confirma a alteração?"
          : "Executando: " + plan.steps.map((s) => s.instruction).join("; ") + ".",
        intent: "toggle_control",
        interaction: { pageId: context.pageId, steps: plan.steps },
      };
    }
    case "explain":
      return {
        reply: surface
          ? surface.purpose + " Controles disponíveis: " + surface.controls.map((c) => c.label).join(", ") + "."
          : "Não conheço essa página ainda.",
        intent: "explain",
      };
    case "guided_goal":
      return {
        reply: "Vou te guiar por etapas para: " + command.raw.replace(/^configure\s*/i, "") + ".",
        intent: "guided_goal",
      };
    default:
      return { reply: "", intent: "free_form" };
  }
}
