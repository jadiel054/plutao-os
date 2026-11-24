/**
 * Classificação de intenção do Chat (pura, sem I/O).
 *
 * Separa definitivamente os dois ambientes:
 *  - "build"  → criação/desenvolvimento direto na conversa (Software Factory).
 *               NUNCA cria missão no Cockpit.
 *  - "mission" → pedido EXPLICITO de missão operacional (executa via runtime
 *               durável do Cockpit; aprovação no Cockpit).
 *  - "conversation" → consulta/análise/assunto genérico.
 *
 * Regras puras vivem em autoMissionRules.ts; este módulo é a fachada usada
 * pelo chat route.
 */

import {
  detectBuildContinuation,
  detectExplicitMissionRequest,
  detectBuildIntent,
} from "../missions/autoMissionRules";

export type ChatIntent = "build" | "mission" | "conversation";

export { detectBuildIntent, detectBuildContinuation, detectExplicitMissionRequest };

/**
 * "Crie um sistema/site" → criação direta no Chat.
 * "Corrija este sistema" → continuidade do desenvolvimento no Chat.
 * "Crie uma missão para auditar..." → missão operacional explícita.
 */
export function classifyChatIntent(userText: string): ChatIntent {
  const clean = (userText ?? "").trim();
  if (detectExplicitMissionRequest(clean)) return "mission";
  if (detectBuildIntent(clean)) return "build";
  if (detectBuildContinuation(clean)) return "build";
  return "conversation";
}
