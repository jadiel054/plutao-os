/**
 * Plano + aprovação inicial da criação no Chat.
 *
 * Antes de qualquer ferramenta de escrita/execução, um plano é gerado por
 * modelo e registrado como Write Gate (provider "chat_build", capability
 * "build_plan", missionId null → aprovação contextual no próprio Chat).
 * A autorização inicial cobre ações não destrutivas dentro do escopo;
 * ações destrutivas, fora do escopo ou com credenciais privadas continuam
 * exigindo gates específicos (fail-closed preservado).
 */

import { chatCompletion } from "@/lib/runtime/model/client";
import type { ModelConfig, ModelMessage } from "@/lib/runtime/model/types";
import { createWriteGate } from "@/lib/connectors/gates";

export const CHAT_BUILD_PLAN_PROVIDER = "chat_build";
export const CHAT_BUILD_PLAN_CAPABILITY = "build_plan";
/** TTL do gate do plano: 1h (o plano pode ser lido com calma antes de aprovar). */
export const CHAT_BUILD_PLAN_TTL_MS = 60 * 60 * 1000;

export type ChatBuildPlan = {
  objective: string;
  scope: string[];
  deliverables: string[];
  steps: string[];
  toolsNeeded: string[];
  limitations: string[];
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0)
    .slice(0, 12);
}

/** Parser tolerante: extrai o primeiro objeto JSON completo do texto do modelo. */
export function parseChatBuildPlan(text: string): ChatBuildPlan | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Record<string, unknown>;
  const objective = typeof rec.objective === "string" ? rec.objective.trim() : "";
  if (!objective) return null;
  return {
    objective,
    scope: asStringArray(rec.scope),
    deliverables: asStringArray(rec.deliverables),
    steps: asStringArray(rec.steps),
    toolsNeeded: asStringArray(rec.toolsNeeded),
    limitations: asStringArray(rec.limitations),
  };
}

export function formatChatBuildPlan(plan: ChatBuildPlan): string {
  const list = (title: string, items: string[]) =>
    items.length ? "\n" + title + ":\n" + items.map((s) => "- " + s).join("\n") : "";
  return [
    "Plano de criação (aguardando sua aprovação)",
    "",
    "Objetivo: " + plan.objective,
    list("Escopo", plan.scope),
    list("Entregáveis", plan.deliverables),
    list("Etapas previstas", plan.steps),
    list("Ferramentas", plan.toolsNeeded),
    list("Limitações", plan.limitations),
    "",
    "Nada foi executado ainda. Aprove o plano no card de aprovação desta conversa para que a criação comece e rode de forma contínua (com checkpoints) até a entrega.",
  ].join("\n");
}

const PLAN_SYSTEM_PROMPT = [
  "Você é o planejador de criação do Plutão OS. Receberá o pedido do usuário e deve produzir um PLANO EXECUTÁVEL de criação (sistema, site, app).",
  "Responda APENAS com um objeto JSON válido (sem markdown, sem fences) no formato:",
  '{"objective":"...","scope":["..."],"deliverables":["..."],"steps":["..."],"toolsNeeded":["filesystem","process"],"limitations":["..."]}',
  "Regras: objetivo em 1 frase; escopo em 2-6 itens curtos; entregáveis concretos; etapas em ordem lógica (3-8); toolsNeeded somente entre: filesystem, process, files.export_markdown, files.export_html, computer, github, vercel; limitações reais (não invente capacidades). Nunca execute nada — apenas planeje.",
].join("\n");

export async function generateChatBuildPlan(opts: {
  modelConfig: ModelConfig;
  userText: string;
  history: Array<{ role: string; content: string }>;
}): Promise<ChatBuildPlan | null> {
  const messages: ModelMessage[] = [
    { role: "system", content: PLAN_SYSTEM_PROMPT },
    ...opts.history.slice(-6).map(
      (m) =>
        ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }) as ModelMessage
    ),
    { role: "user", content: opts.userText },
  ];
  const step = await chatCompletion(opts.modelConfig, messages);
  return parseChatBuildPlan(step.content);
}

/** Registra o plano como Write Gate pendente (aprovação no próprio Chat). */
export async function createChatBuildPlanGate(opts: {
  userId: string;
  conversationId: string;
  plan: ChatBuildPlan;
  /** Pedido original do usuário: preservado no payload para a execução durável. */
  userText: string;
}) {
  const planText = formatChatBuildPlan(opts.plan);
  return await createWriteGate({
    userId: opts.userId,
    missionId: null,
    executionId: null,
    provider: CHAT_BUILD_PLAN_PROVIDER,
    capability: CHAT_BUILD_PLAN_CAPABILITY,
    target: opts.conversationId,
    summary: "Aprovar plano de criação: " + opts.plan.objective.slice(0, 140),
    payload: {
      conversationId: opts.conversationId,
      plan: opts.plan,
      userText: opts.userText,
    },
    contentPreview: planText.slice(0, 2000),
    ttlMs: CHAT_BUILD_PLAN_TTL_MS,
  });
}
