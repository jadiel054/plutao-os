/**
 * H9 — Geração de `docs/CAPABILITIES.md` a partir do registro.
 *
 * O documento é DERIVADO do código: não é editado à mão. O teste de drift
 * (`__tests__/capabilitiesDoc.test.ts`) falha se o doc divergir do registro.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTROL_DESCRIPTIONS,
  IMPLEMENTED_CONTROLS,
  INTERNAL_TOOL_CONTROLS,
  getCapabilityRegistry,
  hasAllControls,
  type CapabilityControl,
} from "./registry";

/** Caminho absoluto de `docs/CAPABILITIES.md` a partir deste módulo. */
export function capabilitiesDocPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // apps/web/src/lib/capabilities → raiz do monorepo
  return resolve(here, "..", "..", "..", "..", "..", "docs", "CAPABILITIES.md");
}

function controlLabel(control: CapabilityControl): string {
  const implemented = IMPLEMENTED_CONTROLS.has(control);
  return `${control}${implemented ? "" : " ⚠️ não implementado"}`;
}

export function generateCapabilitiesMarkdown(): string {
  const entries = getCapabilityRegistry();
  const providers = [...new Set(entries.map((e) => e.provider))].sort();

  const lines: string[] = [];
  lines.push("# Registro de capacidades — Plutão OS");
  lines.push("");
  lines.push(
    "> **Arquivo gerado.** Fonte de verdade: `apps/web/src/lib/capabilities/registry.ts`."
  );
  lines.push(
    "> Não edite este documento à mão — rode `npm run docs:capabilities` e commite o resultado."
  );
  lines.push("");
  lines.push(
    "O registro responde três perguntas antes de qualquer execução: **esta capacidade existe?**,",
    "**ela está habilitada?** e **os controles de segurança que ela exige estão implementados?**",
    "Qualquer resposta negativa faz o executor **recusar** a chamada (fail-closed)."
  );
  lines.push("");

  lines.push("## Controles");
  lines.push("");
  lines.push("| Controle | Implementado | Descrição |");
  lines.push("| --- | --- | --- |");
  for (const [control, description] of Object.entries(CONTROL_DESCRIPTIONS)) {
    lines.push(
      `| \`${control}\` | ${IMPLEMENTED_CONTROLS.has(control as CapabilityControl) ? "sim" : "**não**"} | ${description} |`
    );
  }
  lines.push("");

  lines.push("## Resumo por provedor");
  lines.push("");
  lines.push("| Provedor | Capacidades | Leituras | Escritas | Habilitadas e completas |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const provider of providers) {
    const list = entries.filter((e) => e.provider === provider);
    const reads = list.filter((e) => e.mode === "read").length;
    const writes = list.filter((e) => e.mode === "write").length;
    const ready = list.filter((e) => e.enabled && hasAllControls(e)).length;
    lines.push(`| \`${provider}\` | ${list.length} | ${reads} | ${writes} | ${ready} |`);
  }
  lines.push("");

  for (const provider of providers) {
    const list = entries.filter((e) => e.provider === provider);
    lines.push(`## Provedor: \`${provider}\``);
    lines.push("");
    lines.push("| Capacidade | Modo | Habilitada | Controles exigidos | Evidência |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const entry of list) {
      const controls = entry.requiredControls.map((c) => `\`${controlLabel(c)}\``).join(", ");
      const evidence = entry.evidence.length > 0 ? entry.evidence.join(", ") : "—";
      lines.push(
        `| \`${entry.capability}\` | ${entry.mode} | ${entry.enabled ? "sim" : "**não**"} | ${controls} | ${evidence} |`
      );
    }
    lines.push("");
  }

  lines.push("## Tools internas (não-conector)");
  lines.push("");
  lines.push(
    "Também avaliadas de forma fail-closed pelo dispatcher (`evaluateInternalTool`)."
  );
  lines.push("");
  lines.push("| Tool | Controles exigidos |");
  lines.push("| --- | --- |");
  for (const [tool, controls] of Object.entries(INTERNAL_TOOL_CONTROLS)) {
    lines.push(
      `| \`${tool}\` | ${controls.map((c) => `\`${controlLabel(c)}\``).join(", ")} |`
    );
  }
  lines.push("");

  lines.push("## Garantias verificadas em teste");
  lines.push("");
  lines.push(
    "- `assertRegistryCoverage()` — todo capability de manifesto está declarado e vice-versa."
  );
  lines.push(
    "- Escrita sem gate aprovado, com gate de outro usuário, com payload alterado ou com gate já consumido é **recusada**."
  );
  lines.push(
    "- `files.export_html` neutraliza `<script>`, `on*` e URLs com esquema não permitido."
  );
  lines.push(
    "- Filtros do Supabase recusam parâmetros reservados (`limit`, `select`, `order`, …)."
  );
  lines.push(
    "- Agent loop interrompe por repetição de tool, output idêntico, orçamento de tempo e teto acumulado."
  );
  lines.push("");

  return lines.join("\n");
}
