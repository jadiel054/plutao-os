/**
 * Identidade do agente — fonte única para TODAS as superfícies (chat, missão, MCP).
 *
 * Antes: o `apps/web/src/app/api/chat/route.ts` carregava `name`/`identity`/`personality`
 * da tabela `agents` e **descartava** os valores (só `name` aparecia numa mensagem de
 * fallback sem chave de API), então o perfil configurado em Configurações > Agente não
 * tinha efeito nenhum no comportamento. Já o caminho MCP usava uma identidade
 * hardcoded diferente ("Você é o Plutão, agente de execução").
 *
 * Agora as duas superfícies resolvem a identidade pelo mesmo helper.
 */

import { agents } from "@plutao/db";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { NIX_IDENTITY } from "./operating-principles";

export const DEFAULT_AGENT_NAME = "Nix";
export const DEFAULT_AGENT_IDENTITY =
  "o operador do Plutão OS, assistente pessoal do usuário";

export type AgentProfile = {
  name: string;
  identity: string;
  personality: string | null;
  /** true quando o usuário ainda não personalizou o perfil. */
  isDefault: boolean;
};

export const DEFAULT_AGENT_PROFILE: AgentProfile = {
  name: DEFAULT_AGENT_NAME,
  identity: DEFAULT_AGENT_IDENTITY,
  personality: null,
  isDefault: true,
};

/** Carrega o perfil do agente do usuário. Nunca lança: falha de banco cai no default. */
export async function loadAgentIdentity(userId: string): Promise<AgentProfile> {
  try {
    const rows = await getDb()
      .select({
        name: agents.name,
        identity: agents.identity,
        personality: agents.personality,
      })
      .from(agents)
      .where(eq(agents.userId, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return DEFAULT_AGENT_PROFILE;

    const name = row.name?.trim() || DEFAULT_AGENT_NAME;
    const identity = row.identity?.trim() || DEFAULT_AGENT_IDENTITY;
    const personality = row.personality?.trim() || null;

    return {
      name,
      identity,
      personality,
      isDefault:
        name === DEFAULT_AGENT_NAME &&
        identity === DEFAULT_AGENT_IDENTITY &&
        personality === null,
    };
  } catch {
    return DEFAULT_AGENT_PROFILE;
  }
}

/**
 * Linha de identidade para o system prompt.
 * Com o perfil default o texto é exatamente `NIX_IDENTITY` (sem regressão de prompt).
 */
export function buildIdentityLine(profile: AgentProfile): string {
  if (profile.isDefault) return NIX_IDENTITY;
  return `Você é ${profile.name}, ${profile.identity}.`;
}

/** Bloco completo de identidade (+ personalidade, quando configurada). */
export function buildIdentityBlock(profile: AgentProfile): string {
  const line = buildIdentityLine(profile);
  if (!profile.personality) return line;
  return `${line}\n\nPERSONALIDADE (definida pelo usuário):\n${profile.personality}`;
}
