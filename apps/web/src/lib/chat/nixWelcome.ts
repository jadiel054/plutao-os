/**
 * Tela inicial do Chat — saudação e ações rápidas da Nix.
 *
 * Regras de integridade: nada é inventado. As ações rápidas derivam SOMENTE
 * do contexto real carregado na página (missões, conversas, projetos).
 * Sem contexto, oferecemos apenas ações funcionais genéricas que o agente
 * resolve com dados do servidor.
 */

export type GreetingPeriod = "madrugada" | "manha" | "tarde" | "noite";

export function greetingPeriod(hour: number): GreetingPeriod {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h < 5) return "madrugada";
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

export function greetingFor(hour: number, agentName: string): string {
  switch (greetingPeriod(hour)) {
    case "madrugada":
      return "Boa madrugada. Eu sou " + agentName + ".";
    case "manha":
      return "Bom dia. Eu sou " + agentName + ".";
    case "tarde":
      return "Boa tarde. Eu sou " + agentName + ".";
    default:
      return "Boa noite. Eu sou " + agentName + ".";
  }
}

export type QuickActionKind = "mission" | "conversation" | "project" | "tasks" | "overview";

export type QuickAction = {
  id: string;
  kind: QuickActionKind;
  label: string;
  description: string;
  prompt: string;
  missionId?: string;
  conversationId?: string;
};

export type WelcomeMission = { id: string; objective: string; status?: string };
export type WelcomeConversation = { id: string; title: string; updatedAt?: string };
export type WelcomeProject = { id: string; name: string };

export type WelcomeContext = {
  missions: WelcomeMission[];
  conversations: WelcomeConversation[];
  projects: WelcomeProject[];
};

function truncate(value: string, max: number): string {
  const v = value.trim();
  return v.length > max ? v.slice(0, max - 1).trimEnd() + "…" : v;
}

function latestConversation(convs: WelcomeConversation[]): WelcomeConversation | null {
  if (convs.length === 0) return null;
  return [...convs].sort((a, b) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return tb - ta;
  })[0];
}

/**
 * Linha de continuidade: usa apenas o que o sistema realmente tem.
 * Retorna null quando não há contexto real para oferecer.
 */
export function continuityLine(ctx: WelcomeContext): string | null {
  const conv = latestConversation(ctx.conversations);
  if (conv?.title) {
    return "Podemos retomar por onde paramos em “" + truncate(conv.title, 48) + "”.";
  }
  const mission = ctx.missions[0];
  if (mission?.objective) {
    return "A missão “" + truncate(mission.objective, 48) + "” segue aberta. Quer retomar?";
  }
  return null;
}

export function buildQuickActions(ctx: WelcomeContext, max = 4): QuickAction[] {
  const actions: QuickAction[] = [];

  const mission = ctx.missions[0];
  if (mission?.objective) {
    actions.push({
      id: "mission-" + mission.id,
      kind: "mission",
      missionId: mission.id,
      label: truncate(mission.objective, 42),
      description: "Retomar a missão mais recente e ver o que falta.",
      prompt:
        "Qual o status atual da missão “" + truncate(mission.objective, 80) +
        "”? Liste o que já foi feito e o que falta para concluir.",
    });
  }

  const conv = latestConversation(ctx.conversations);
  if (conv?.title) {
    actions.push({
      id: "conversation-" + conv.id,
      kind: "conversation",
      conversationId: conv.id,
      label: "Retomar conversa",
      description: truncate(conv.title, 48),
      prompt:
        "Quero retomar a conversa “" + truncate(conv.title, 60) +
        "”. Resuma onde paramos e sugira os próximos passos.",
    });
  }

  const project = ctx.projects[0];
  if (project?.name) {
    actions.push({
      id: "project-" + project.id,
      kind: "project",
      label: "Projeto " + truncate(project.name, 30),
      description: "Continuar o trabalho deste projeto.",
      prompt: "Vamos trabalhar no projeto “" + project.name + "”. Por onde começamos hoje?",
    });
  }

  actions.push({
    id: "tasks",
    kind: "tasks",
    label: "Consultar tarefas",
    description: "Pendências e bloqueios do momento.",
    prompt: "Liste minhas tarefas pendentes e o que está bloqueado no momento.",
  });

  if (actions.length < max) {
    actions.push({
      id: "overview",
      kind: "overview",
      label: "Panorama atual",
      description: "O que está em andamento agora.",
      prompt:
        "Faça um panorama do que está em andamento nos meus projetos e missões, e sugira o próximo passo.",
    });
  }

  return actions.slice(0, max);
}
