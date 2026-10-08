import {
  DEFAULT_AGENT_PROFILE,
  buildIdentityBlock,
  type AgentProfile,
} from "@/lib/agente/identity";
import { type ToolName } from "@/lib/runtime/tools/types";
import type { MissionSpecialistProfile } from "@/lib/missions/specialistProfiles";

export type MissionAgentInfo = AgentProfile | null;

type ConnectorToolName = "github" | "vercel" | "supabase" | "telegram" | "cloudflare" | "render";
const CONNECTOR_ACTION_TOOL: Record<string, ConnectorToolName> = {
  repo_create: "github",
  push_files: "github",
  prs_create: "github",
  branches_create: "github",
  project_create: "vercel",
  deploy_create: "vercel",
};
const CONNECTOR_DISPLAY_TERMS: Record<ConnectorToolName, RegExp> = {
  github: /\bgithub\b/i,
  vercel: /\bvercel\b/i,
  supabase: /\bsupabase\b/i,
  telegram: /\btelegram\b/i,
  cloudflare: /\bcloudflare\b/i,
  render: /\brender\b/i,
};

/**
 * Restringe o bloco textual do runtime ao escopo do perfil. A autorização real
 * continua no dispatcher e nos executores; este filtro evita expor opções não
 * disponíveis ao modelo como se fossem utilizáveis.
 */
export function filterConnectorBlockForSpecialist(
  connectorBlock: string,
  profile: MissionSpecialistProfile
): string {
  const allowed = new Set<ToolName>(profile.allowedTools);
  const hasExport = profile.allowedTools.some((tool) => tool.startsWith("files.export_"));

  return connectorBlock
    .split("\n")
    .filter((line) => {
      if (line.startsWith("FERRAMENTAS NATIVAS DE EXPORTAÇÃO")) return hasExport;

      const exportMatch = line.match(/^-\s+(files\.export_[a-z_]+):/);
      if (exportMatch) return allowed.has(exportMatch[1] as ToolName);

      const connectorMatch = line.match(/\[([a-z_]+)\]:/i);
      if (connectorMatch) {
        return allowed.has(connectorMatch[1] as ToolName);
      }

      for (const [action, tool] of Object.entries(CONNECTOR_ACTION_TOOL)) {
        if (new RegExp(`\\b${action}\\b`).test(line) && !allowed.has(tool)) return false;
      }
      for (const [tool, pattern] of Object.entries(CONNECTOR_DISPLAY_TERMS)) {
        if (pattern.test(line) && !allowed.has(tool as ToolName)) return false;
      }
      return true;
    })
    .join("\n");
}

function availableToolsSection(profile: MissionSpecialistProfile): string {
  return [
    "Available tools (specialist allowlist; use only these exact tool names):",
    ...profile.allowedTools.map((tool) => `- ${tool}`),
    "Use the action schema shown in the filtered CONNECTORS section. Never invent a tool or capability.",
  ].join("\n");
}

function toolCallFormatSection(profile?: MissionSpecialistProfile | null): string {
  if (!profile) {
    return `You may either:
1) Reply with short reasoning in plain text, OR
2) Propose exactly one tool call as JSON only:
{"tool":"note","input":"text to record"}
or
{"tool":"filesystem","input":"{\\\"action\\\":\\\"list\\\",\\\"payload\\\":{\\\"path\\\":\\\"dir\\\"}}"}
or
{"tool":"github","input":"{\\\"action\\\":\\\"repo_create\\\",\\\"name\\\":\\\"my-repo\\\",\\\"private\\\":false,\\\"missionId\\\":\\\"<missionId>\\\"}"}`;
  }

  const examples = [`{"tool":"${profile.allowedTools[0]}","input":"..."}`];
  if (profile.allowedTools.includes("filesystem")) {
    examples.push(
      `{"tool":"filesystem","input":"{\\\"action\\\":\\\"list\\\",\\\"payload\\\":{\\\"path\\\":\\\"dir\\\"}}"}`
    );
  }
  return `You may either reply with short reasoning in plain text, or propose exactly one tool call as JSON only using a tool from the specialist allowlist:\n${examples.join("\nor\n")}`;
}

function writeSafetySection(specialist: boolean): string {
  if (!specialist) {
    return `WRITES AND HUMAN APPROVAL (Princípio 1):
- Write actions (repo_create, push_files, project_create, deploy_create, etc.) are executed when the connector is CONNECTED.
- A write without a valid _gateId creates a write_gate and returns GATE_PENDING; nothing has been executed yet. The runtime pauses the node and durable job until the human decision in chat. Never claim that effect is complete or bypass approval. After approve/reject, the same execution resumes through the worker.
- Never claim you only have read tools when the connector block lists write capabilities.
- Typical site/app flow: GitHub (repo_create + push_files) → Vercel (project_create / deploy_create), gates at each write.
- Include "missionId" in the JSON payload of write actions so the gate links to this mission.`;
  }

  return `WRITES AND HUMAN APPROVAL (Princípio 1):
- A allowlist deste perfil é um teto, nunca concede autorização nova. Só proponha ferramentas listadas acima e capabilities presentes no bloco CONNECTORS filtrado.
- A autorização do usuário, o estado CONNECTED, o registro de capabilities e os controles existentes continuam obrigatórios.
- Qualquer escrita externa continua protegida pelo Write Gate. Sem _gateId válido, nada foi executado; o job pausa para decisão humana e retoma pela mesma execution.
- Nunca afirme que um efeito ocorreu sem evidence verificável, e nunca peça para contornar o gate.
- Inclua "missionId" no payload de escrita quando aplicável.`;
}

export function buildSystemPrompt(
  agent: MissionAgentInfo,
  connectorBlock: string,
  missionId?: string | null,
  specialist?: MissionSpecialistProfile | null
): string {
  const identityLines = buildIdentityBlock(agent ?? DEFAULT_AGENT_PROFILE);
  const missionIdLine = missionId
    ? `\nCurrent missionId (include it in every tool JSON payload as "missionId"): ${missionId}\n`
    : "\n";
  const scopedConnectorBlock = specialist
    ? filterConnectorBlockForSpecialist(connectorBlock, specialist)
    : connectorBlock;
  const specialistSection = specialist
    ? `\nSPECIALIST PROFILE — ${specialist.label}\n${specialist.instructions}\nThe profile is subordinate to system safety and the user's permissions. Do not attempt another node's work.\n`
    : "";
  const toolsSection = specialist
    ? availableToolsSection(specialist)
    : `Available tools (dispatched by the runtime):
- note — record a note
- filesystem — actions: list | read | write | mkdir | stat (payload.path)
- github — requires GitHub OAuth connected
- vercel — requires Vercel connector connected
- supabase — requires Supabase connector connected
- telegram — requires Telegram connector connected
- cloudflare — requires Cloudflare connector connected
- render — requires Render connector connected
- files.export_pdf | files.export_xlsx | files.export_markdown | files.export_html — file exports

GitHub actions: repos_list | repo_get | issues_list | issues_get | pulls_list | actions_list | branches_list | code_search | tree (reads) — and repo_create | push_files | branches_create | prs_create (writes, gated)
Vercel actions: projects_list | deployments_list | deployment_get (reads) — and project_create | deploy_create (writes, gated)`;

  return `You are the decision component of Plutão OS runtime.
You do NOT control the runtime. You only propose the next action.

${identityLines}${specialistSection}${missionIdLine}
${toolCallFormatSection(specialist)}

${toolsSection}

CONNECTORS (source of truth — do not invent status; only use tools of CONNECTED connectors):
${scopedConnectorBlock || "(connector runtime unavailable — prefer note/filesystem only)"}

${writeSafetySection(Boolean(specialist))}

Rules:
- Stay consistent with the agent identity and specialist profile above.
- Prefer a tool call only when it helps the mission.
- For filesystem: valid JSON with action (list/read/write/mkdir/stat) and payload.path
- For connector tools: valid JSON with action and owner/repo/number when required.
- Never invent other tool names.
- Keep replies concise.`;
}
