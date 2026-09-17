# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-17 — Kernel de agentes + 1.2 auto-plan + 1.1 tools→View

## Fase

Runtime + Agent Loop + Filesystem + Cockpit + Autonomia V1.1 + DoD + Pending Intents → **VERIFIED**.
Background Execution V1 → **IMPLEMENTED**.
Smart Long-Input / Artifacts → **VERIFIED**.
Controles de dados (Privacidade) → **IMPLEMENTED**.
Mission Workspace V1 → **IMPLEMENTED**.
Tools → eventos da View (1.1) → **IMPLEMENTED**.
Kernel de papéis (domain) → **IMPLEMENTED**.
Auto suggestedPlan no chat (1.2) → **IMPLEMENTED**.

## Matriz

| Área | Status |
|------|--------|
| Durable Runtime & Checkpoints | **VERIFIED** |
| Agent Loop & Tool Dispatcher | **VERIFIED** |
| Model nuvem + local | **VERIFIED** |
| Evidence / DoD gate | **VERIFIED** |
| Filesystem Tool V1 | **VERIFIED** |
| Pending Intents offline | **VERIFIED** |
| Background autonomous-run | **IMPLEMENTED** |
| Artifacts + Long Input | **VERIFIED** |
| Brand + home limpa (sem Phase badge) | **IMPLEMENTED** |
| Sobre em lista (ajuda / legal / versão) | **IMPLEMENTED** |
| Privacidade (export / delete / toggles) | **IMPLEMENTED** |
| Mission Workspace V1 | **IMPLEMENTED** |
| Tools → plan.events (View ao vivo) | **IMPLEMENTED** |
| Domain AgentRole (Núcleo/Planejador/Executor/Verificador) | **IMPLEMENTED** |
| Auto suggestedPlan no chat (1.2) | **IMPLEMENTED** |
| Aplicar plano na missão a partir do card do chat | **IMPLEMENTED** (UI) |
| Stop-mission / cancel runtime | **PENDENTE** (1.3) |
| Páginas /ajuda e /legal/* com conteúdo original | **PENDENTE** (pesquisa de domínio antes) |
| Conectores MCP (OAuth estados completos) | **PENDENTE** (pós-kernel) |
| Lixeira + recibo de exclusão | **PENDENTE** |
| Computador / browser virtual | **PENDENTE** |

## O que NÃO está feito (honesto)

- Conteúdo de `/ajuda` e `/legal/*` — links no Sobre existem; páginas dedicadas só após pesquisa e redação original Plutão (sem template genérico).
- Conectores MCP (GitHub etc.) — decisão registrada; implementação depois do kernel estável.
- Stop de missão no runtime (1.3).
- APK / lojas / assinaturas — visão de produto, não código ainda.

## Kernel de agentes

Papéis em `packages/domain/src/agents`:

- **Núcleo** — voz com o usuário, intent
- **Planejador** — missions.plan + align
- **Executor** — loop + tools + plan.events
- **Verificador** — DoD + failure gate

## 1.2 Auto-plan

- `extractSuggestedPlan` lê passos numerados da resposta do Núcleo
- API `/api/chat` devolve `suggestedPlan: { stepTitles }`
- UI do chat oferece criar/aplicar plano na missão ativa

## Próximos marcos

1. Stop-mission / cancel runtime — 1.3
2. Validar background com aba fechada — 2.1
3. Lixeira V1 — 2.2
4. Pesquisa + redação original `/ajuda` e `/legal/*`
5. Conectores MCP (estados: desconectado → autorizando → conectado → reconectar → erro)
