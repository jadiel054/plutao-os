#!/usr/bin/env python3
"""Documenta a correção de identidade do agente (H10)."""
from pathlib import Path


def patch(path, pairs):
    p = Path(path)
    s = p.read_text(encoding="utf-8")
    for old, new, label in pairs:
        assert old in s, f"{path}: nao encontrado -> {label}"
        s = s.replace(old, new)
        print(f"ok: {path} :: {label}")
    p.write_text(s, encoding="utf-8")


# ---------------- HARDENING_2026-10.md ----------------
patch(
    "docs/HARDENING_2026-10.md",
    [
        (
            "- [H9 — Ausência de registro tipado de capacidades](#h9)",
            "- [H9 — Ausência de registro tipado de capacidades](#h9)\n"
            "- [H10 — Identidade do agente configurada era descartada](#h10)",
            "indice",
        ),
        (
            "**Resultado:** 9 famílias de falhas corrigidas na raiz, 1 migration aplicada em produção,\n"
            "319 testes verdes, `tsc --noEmit` limpo nos três workspaces, documentação sincronizada com o código.",
            "**Resultado:** 10 famílias de falhas corrigidas na raiz, 1 migration aplicada em produção,\n"
            "328 testes verdes, `tsc --noEmit` limpo nos três workspaces, documentação sincronizada com o código.",
            "resultado",
        ),
        (
            "| Testes | 315 (7 falhando) | **319 (0 falhando)** |",
            "| Testes | 315 (7 falhando) | **328 (0 falhando)** |",
            "tabela testes",
        ),
        (
            "| Orçamento acumulado do agent loop | inexistente | **60 iterações + 240 s por execution** |",
            "| Orçamento acumulado do agent loop | inexistente | **60 iterações + 240 s por execution** |\n"
            "| Identidade do agente | configurada e descartada | **aplicada no chat e no MCP** |",
            "tabela identidade",
        ),
        (
            "---\n\n<a id=\"banco-de-dados\"></a>",
            "---\n\n"
            "<a id=\"h10\"></a>\n"
            "## H10 — Identidade do agente configurada era descartada\n\n"
            "**Encontrado.** O usuário configura nome, identidade e personalidade do agente em\n"
            "Configurações > Agente (`PATCH /api/agent` → tabela `agents`). O `api/chat/route.ts` lia esses\n"
            "campos em cada requisição e **jogava fora**: `agentName` só aparecia numa mensagem de fallback\n"
            "quando não havia chave de API, `agentIdentity` nunca era usado e `personality` era lido e\n"
            "ignorado por completo. O system prompt começava sempre com o literal `NIX_IDENTITY`, então\n"
            "personalizar o agente não mudava nada no comportamento.\n\n"
            "Além disso, o caminho MCP (`plutao_send_message`) usava uma **persona diferente**,\n"
            "hardcoded: `\"Você é o Plutão, agente de execução\"` — e sem os princípios operacionais\n"
            "(regra de ouro do operador minucioso). O mesmo agente respondia como duas entidades distintas\n"
            "dependendo da superfície.\n\n"
            "**Corrigido em.**\n"
            "- `apps/web/src/lib/agente/identity.ts` (novo) — `loadAgentIdentity(userId)`,\n"
            "  `buildIdentityLine`, `buildIdentityBlock`, com fallback silencioso para o perfil default.\n"
            "- `apps/web/src/app/api/chat/route.ts` — passa a usar o perfil no system prompt\n"
            "  (identidade + bloco de personalidade quando configurada).\n"
            "- `apps/web/src/lib/mcp/tools.ts` — mesmo perfil, mesma identidade e mesmos princípios\n"
            "  operacionais do chat.\n\n"
            "**Como.** Com o perfil default, `buildIdentityLine` devolve **exatamente** `NIX_IDENTITY`,\n"
            "então não há regressão de prompt para quem nunca personalizou. Com perfil customizado, o\n"
            "prompt passa a dizer `Você é <nome>, <identidade>.` e, se houver, um bloco\n"
            "`PERSONALIDADE (definida pelo usuário)`.\n\n"
            "**Por quê.** Uma configuração de identidade que não afeta o comportamento é um bug de\n"
            "produto, não uma preferência cosmética: o usuário define como o agente deve se comportar e o\n"
            "sistema ignora. E duas personas diferentes no mesmo produto quebram a percepção de um agente\n"
            "único e coerente.\n\n"
            "---\n\n<a id=\"banco-de-dados\"></a>",
            "secao H10",
        ),
        (
            "| `lib/capabilities/__tests__/capabilitiesDoc.test.ts` | cobertura do registro + drift da documentação |",
            "| `lib/capabilities/__tests__/capabilitiesDoc.test.ts` | cobertura do registro + drift da documentação |\n"
            "| `lib/agente/__tests__/identity.test.ts` | identidade default = `NIX_IDENTITY`, perfil custom, personalidade, fallback de banco |\n"
            "| `lib/mcp/__tests__/sendMessageEventsOrder.test.ts` | MCP usa a mesma identidade e os princípios do chat |",
            "tabela testes H10",
        ),
        (
            "apps/web/src/lib/capabilities/registry.ts\n",
            "apps/web/src/lib/agente/identity.ts\napps/web/src/lib/capabilities/registry.ts\n",
            "novos arquivos",
        ),
        (
            "apps/web/src/lib/chat/renderToolRunner.ts\n",
            "apps/web/src/lib/agente/__tests__/identity.test.ts\napps/web/src/lib/chat/renderToolRunner.ts\n",
            "novos arquivos 2",
        ),
        (
            "apps/web/src/lib/mcp/tools.ts\napps/web/src/lib/mcp/audit.ts\n",
            "apps/web/src/lib/mcp/tools.ts\napps/web/src/lib/mcp/audit.ts\napps/web/src/lib/mcp/__tests__/sendMessageEventsOrder.test.ts\n",
            "alterados MCP",
        ),
    ],
)

# ---------------- CURRENT_STATE.md ----------------
patch(
    "docs/CURRENT_STATE.md",
    [
        (
            "| **Filtros Supabase validados (H4)** | **VERIFICADO** (2026-10-07) |",
            "| **Identidade do agente aplicada (H10)** | **VERIFICADO** (2026-10-07) | Perfil de Configurações > Agente (`name`/`identity`/`personality`) era carregado e descartado no chat; o MCP usava persona hardcoded diferente. Agora `lib/agente/identity.ts` alimenta chat e MCP com a mesma identidade e os mesmos princípios operacionais. Default permanece idêntico a `NIX_IDENTITY`. |\n"
            "| **Filtros Supabase validados (H4)** | **VERIFICADO** (2026-10-07) |",
            "linha identidade",
        ),
        (
            "- Identidade do Agente (Nix) | **VERIFICADO** | System prompt configurado com `\"Você é Nix, o operador do Plutão OS, assistente pessoal do usuário.\"`. UI exibe disclaimer discreto condicional \"Nix é uma IA e pode cometer erros.\" quando há mensagens. |",
            "- Identidade do Agente (Nix) | **VERIFICADO** (2026-10-07) | System prompt usa `NIX_IDENTITY` como default e passa a respeitar o perfil configurado em Configurações > Agente (`name`/`identity`/`personality`), tanto no chat quanto no MCP. UI exibe disclaimer discreto condicional \"Nix é uma IA e pode cometer erros.\" quando há mensagens. |",
            "linha Nix",
        ),
    ],
)

# ---------------- VERIFICATION.md ----------------
patch(
    "docs/VERIFICATION.md",
    [
        (
            "- [x] **Documentation Drift Guard (H9):**",
            "- [x] **Agent Identity Applied (H10):** perfil de Configurações > Agente (`name`, `identity`,\n"
            "      `personality`) alimenta o system prompt do chat **e** do MCP; default idêntico a `NIX_IDENTITY`.\n"
            "- [x] **Documentation Drift Guard (H9):**",
            "Layer M identidade",
        ),
        (
            "- [x] **Evidence:** 319 testes verdes, `tsc --noEmit` limpo, migration `0020` aplicada em produção.",
            "- [x] **Evidence:** 328 testes verdes, `tsc --noEmit` limpo, migration `0020` aplicada em produção.",
            "evidence",
        ),
    ],
)

print("docs de identidade atualizados")
