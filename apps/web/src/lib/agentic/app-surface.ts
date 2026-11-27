/**
 * Registro semântico das superfícies do próprio Plutão.
 *
 * Estrutura a percepção: cada página tem finalidade, controles conhecidos
 * (seletores semânticos) e capacidades relacionadas. A percepção visual
 * complementa; a base é SEMPRE a informação estruturada.
 */

export type ControlKind = "toggle" | "button" | "input" | "search" | "textarea" | "select" | "nav" | "text";

export type SurfaceControl = {
  id: string;
  label: string;
  kind: ControlKind;
  /** Seletor semântico estável (data-testid preferencial). */
  testId?: string;
  /** Chave de estado (ex.: users.preferences.autonomyMode). */
  stateKey?: string;
  /** Toggle exige confirmação? (controles sensíveis) */
  sensitive?: boolean;
  description?: string;
};

export type AppSurface = {
  pageId: string;
  route: string;
  purpose: string;
  controls: SurfaceControl[];
  relatedCapabilities?: string[];
};

export const APP_SURFACES: AppSurface[] = [
  {
    pageId: "chat",
    route: "/chat",
    purpose: "Conversa com a Nix, criação via tools e acompanhamento de ações do agente.",
    controls: [
      { id: "chat.history", label: "Histórico de conversas", kind: "nav", testId: "chat-history" },
      { id: "chat.input", label: "Caixa de mensagem", kind: "input", testId: "chat-input" },
      { id: "chat.send", label: "Enviar mensagem", kind: "button", testId: "chat-send" },
    ],
  },
  {
    pageId: "cockpit",
    route: "/cockpit",
    purpose: "Painel de missões: execução, planos, evidências e tarefas.",
    controls: [
      { id: "cockpit.missions", label: "Lista de missões", kind: "nav", testId: "cockpit-missions" },
    ],
    relatedCapabilities: ["note.write"],
  },
  {
    pageId: "configuracoes",
    route: "/configuracoes",
    purpose: "Configurações do usuário: preferências, conectores, autonomia do agente.",
    controls: [
      { id: "config.autonomy", label: "Modo de autonomia do agente", kind: "select", stateKey: "users.preferences.autonomyMode", sensitive: true, description: "standard/elevated/full — controla atrito de aprovação de escritas." },
      { id: "config.notifications", label: "Notificações push", kind: "toggle", testId: "notifications-toggle", stateKey: "users.preferences.pushNotifications" },
    ],
  },
  {
    pageId: "modelos",
    route: "/modelos",
    purpose: "Vitrine de modelos locais e seleção de modelo para inferência.",
    controls: [
      { id: "modelos.select", label: "Seleção de modelo", kind: "select", testId: "model-select" },
    ],
  },
  {
    pageId: "planos",
    route: "/planos",
    purpose: "Planos e cobrança da conta.",
    controls: [],
  },
  {
    pageId: "artemis",
    route: "/artemis",
    purpose: "Painel do dispositivo Artemis (execução em device físico).",
    controls: [],
  },
  {
    pageId: "ajuda",
    route: "/ajuda",
    purpose: "Ajuda e informações do sistema: tutoriais, diagnóstico e documentação.",
    controls: [],
  },
];

export function findSurface(pageId: string): AppSurface | null {
  return APP_SURFACES.find((s) => s.pageId === pageId || s.route === pageId) ?? null;
}

export function surfacesSummary(): string {
  return APP_SURFACES.map((s) => s.route + " — " + s.purpose).join("\n");
}