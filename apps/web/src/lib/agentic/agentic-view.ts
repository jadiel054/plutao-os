/**
 * Visão operacional compartilhada do núcleo agêntico.
 *
 * Bloco injetado nos prompts (chat, runtime) com o inventário de capacidades
 * e superfícies + políticas de recuperação/aprendizado. Fontes: registro de
 * capacidades (estático) + superfícies registradas. Experiências
 * persistidas são consultadas em runtime pelo plano de recuperação.
 */

import { getEnabledCapabilities } from "@/lib/capabilities/registry";
import { APP_SURFACES } from "./app-surface";

export function buildAgenticViewBlock(): string {
  const caps = getEnabledCapabilities();
  const byProvider = new Map<string, string[]>();
  for (const c of caps) {
    const list = byProvider.get(c.provider) ?? [];
    list.push(c.capability + (c.mode === "write" ? " (escrita, exige gate)" : ""));
    byProvider.set(c.provider, list);
  }
  const lines: string[] = [];
  for (const [provider, list] of byProvider) {
    lines.push("- " + provider + ": " + list.sort().join(", "));
  }
  const surfaceLines = APP_SURFACES.map((s) => "- " + s.route + ": " + s.purpose);

  return `
VISÃO OPERACIONAL DO PLUTÃO (núcleo agêntico):

Capacidades habilitadas (registro único, fail-closed):
${lines.join("\n")}

Superfícies do sistema que você conhece e pode operar/perceber:
${surfaceLines.join("\n")}

POLÍTICAS DE RECUPERAÇÃO E APRENDIZADO:
- Ferramenta/API/conector falhou? Classifique o obstáculo, avalie alternativas AUTORIZADAS no registro, execute a mais confiável e valide o resultado real antes de prosseguir. Não abandone a missão por limitação pontual.
- NUNCA invente dados para preencher lacunas; sem alternativa autorizada, solicite intervenção humana relatando exatamente o que falta.
- Métodos que já falharam estão registrados como experiência: evite repeti-los. Experiências antigas só valem se versão/ambiente/permissões ainda forem compatíveis.
- Aprender a usar uma ferramenta (doc/probe autorizado, somente leitura) NÃO concede permissão: escritas continuam sujeitas a gate humano.
- Ao descobrir capacidade nova/alterada, registre o conhecimento operacional (contrato, auth, limitações, utilidade) para uso global pelo núcleo.
`;
}
