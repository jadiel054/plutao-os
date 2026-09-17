/**
 * Kernel de agentes do Plutão — plan-and-execute hierárquico.
 *
 * Não é swarm livre. Quatro papéis explícitos, topologia rasa,
 * uma voz com o usuário (Núcleo). Especialistas posteriores =
 * tools sob o Executor, não malha solta.
 */

export type AgentRoleId =
  | "nucleo"
  | "planejador"
  | "executor"
  | "verificador";

export interface AgentRoleDefinition {
  id: AgentRoleId;
  /** Nome interno (não é persona de marketing) */
  name: string;
  /** Responsabilidade única e auditável */
  responsibility: string;
  /** O que este papel NÃO faz */
  doesNot: string[];
  /** Superfície de código / runtime já existente */
  surfaces: string[];
}

/**
 * Definições canônicas. Fonte de verdade para runtime e docs internas.
 * A UI do produto não lista "agentes" como personas — o usuário fala
 * com o Núcleo; o resto é pipeline.
 */
export const AGENT_ROLES: Record<AgentRoleId, AgentRoleDefinition> = {
  nucleo: {
    id: "nucleo",
    name: "Núcleo",
    responsibility:
      "Única voz com o usuário. Classifica intent (chat | mission | project | config), resume entendimento e pede confirmação antes de executar.",
    doesNot: [
      "executar tools de missão sem plano alinhado",
      "pular o Planejador em tarefas com objetivo claro",
      "inventar capacidades que o runtime não tem",
    ],
    surfaces: [
      "apps/web/src/app/api/chat/route.ts",
      "Mission Workspace (seletor + chat)",
    ],
  },
  planejador: {
    id: "planejador",
    name: "Planejador",
    responsibility:
      "Produz e mantém missions.plan (JSON v1): passos, brief, aligned. Só libera RUNNING após aligned: true.",
    doesNot: [
      "executar tools",
      "marcar passo PASSED",
      "falar com o usuário fora do fluxo do Núcleo",
    ],
    surfaces: [
      "packages/domain/src/mission-workspace",
      "apps/web/src/app/api/missions/[id]/plan/route.ts",
      "MissionPlanner / MissionWorkspaceBar",
    ],
  },
  executor: {
    id: "executor",
    name: "Executor",
    responsibility:
      "Corre o agent loop e o dispatcher de tools; grava evidência e eventos na View (plan.events).",
    doesNot: [
      "alterar o plano sem passar pelo gate",
      "avançar passo N+1 se N não está PASSED",
      "ignorar stop / cancel",
    ],
    surfaces: [
      "apps/web/src/lib/runtime",
      "apps/web/src/lib/runtime/tools",
      "apps/web/src/lib/missions/planEvents.ts",
    ],
  },
  verificador: {
    id: "verificador",
    name: "Verificador",
    responsibility:
      "DoD, evidência e gate de falha: FAILED → INSPECTING → FIXING → TESTING → PASSED.",
    doesNot: [
      "inventar sucesso sem evidência",
      "permitir avanço com passo em falha aberta",
    ],
    surfaces: [
      "apps/web/src/lib/missions/dod.ts",
      "applyStepTransition / canStartStep",
      "MissionExecutionView / MissionEvidencePanel",
    ],
  },
};

export const AGENT_ROLE_ORDER: AgentRoleId[] = [
  "nucleo",
  "planejador",
  "executor",
  "verificador",
];

export function getAgentRole(id: AgentRoleId): AgentRoleDefinition {
  return AGENT_ROLES[id];
}

export function listAgentRoles(): AgentRoleDefinition[] {
  return AGENT_ROLE_ORDER.map((id) => AGENT_ROLES[id]);
}
