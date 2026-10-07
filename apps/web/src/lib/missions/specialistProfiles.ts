import type { ToolName } from "@/lib/runtime/tools/types";

/**
 * Perfis são configurações de execução serial, não agentes paralelos.
 * A allowlist restringe ferramentas inteiras; permissões de usuário, manifests,
 * rate limits e Write Gates continuam sendo verificados pelos executores reais.
 */
export type MissionSpecialistProfile = {
  id: string;
  label: string;
  instructions: string;
  allowedTools: readonly ToolName[];
  allowedCapabilities: readonly string[];
};

function profile<const T extends Omit<MissionSpecialistProfile, "allowedCapabilities">>(
  definition: T
): T & Pick<MissionSpecialistProfile, "allowedCapabilities"> {
  const allowedTools = Object.freeze([...definition.allowedTools]);
  return Object.freeze({
    ...definition,
    allowedTools,
    allowedCapabilities: Object.freeze(allowedTools.map(toolCapabilityId)),
  });
}

export function toolCapabilityId(toolName: string): string {
  return `tool:${toolName}`;
}

export const MISSION_SPECIALIST_PROFILES = Object.freeze({
  software_engineer: profile({
    id: "software_engineer",
    label: "Engenharia de software",
    instructions:
      "Atue como especialista de engenharia de software. Inspecione antes de alterar; prefira mudanças pequenas e reversíveis; respeite a arquitetura existente; execute testes e verificações relevantes; relate evidências e limitações. Nunca declare deploy ou escrita concluídos sem resultado verificável.",
    allowedTools: [
      "note",
      "filesystem",
      "github",
      "vercel",
      "files.export_markdown",
    ],
  }),
  teaching_assistant: profile({
    id: "teaching_assistant",
    label: "Ensino e aprendizagem",
    instructions:
      "Atue como especialista de ensino. Adapte profundidade e vocabulário ao objetivo; explique conceitos em etapas curtas; use exemplos e exercícios verificáveis; destaque incertezas e não invente fontes. Não execute mudanças em repositórios ou serviços externos.",
    allowedTools: [
      "note",
      "filesystem",
      "files.export_pdf",
      "files.export_xlsx",
      "files.export_markdown",
    ],
  }),
} satisfies Record<string, MissionSpecialistProfile>);

export type MissionSpecialistProfileId = keyof typeof MISSION_SPECIALIST_PROFILES;

export function listMissionSpecialistProfileOptions(): Array<{ id: string; label: string }> {
  return Object.values(MISSION_SPECIALIST_PROFILES).map(({ id, label }) => ({ id, label }));
}

export function getMissionSpecialistProfile(
  profileId: string | null | undefined
): MissionSpecialistProfile | null {
  if (!profileId || !Object.prototype.hasOwnProperty.call(MISSION_SPECIALIST_PROFILES, profileId)) {
    return null;
  }
  return MISSION_SPECIALIST_PROFILES[profileId as MissionSpecialistProfileId];
}

export type SpecialistPolicyResolution =
  | { ok: true; profile: MissionSpecialistProfile | null }
  | {
      ok: false;
      reason: "UNKNOWN_PROFILE" | "CAPABILITY_NOT_ALLOWED" | "CAPABILITY_WITHOUT_PROFILE";
      missingCapabilities?: string[];
    };

/**
 * Resolves a graph node's requested capabilities against a known profile.
 * `requiredCapabilities` use coarse, stable ids such as `tool:github`; they can
 * never add a tool outside the profile allowlist.
 */
export function resolveSpecialistPolicy(
  profileId: string | null | undefined,
  requiredCapabilities: readonly string[] = []
): SpecialistPolicyResolution {
  if (!profileId) {
    return requiredCapabilities.length === 0
      ? { ok: true, profile: null }
      : { ok: false, reason: "CAPABILITY_WITHOUT_PROFILE", missingCapabilities: [...requiredCapabilities] };
  }

  const resolved = getMissionSpecialistProfile(profileId);
  if (!resolved) return { ok: false, reason: "UNKNOWN_PROFILE" };

  const allowed = new Set(resolved.allowedCapabilities);
  const missingCapabilities = requiredCapabilities.filter((capability) => !allowed.has(capability));
  if (missingCapabilities.length > 0) {
    return { ok: false, reason: "CAPABILITY_NOT_ALLOWED", missingCapabilities };
  }
  return { ok: true, profile: resolved };
}

export function isToolAllowedBySpecialist(
  profileId: string | null | undefined,
  requiredCapabilities: readonly string[],
  toolName: string
): boolean {
  const policy = resolveSpecialistPolicy(profileId, requiredCapabilities);
  if (!policy.ok) return false;
  if (!policy.profile) return true;
  return policy.profile.allowedCapabilities.includes(toolCapabilityId(toolName));
}
