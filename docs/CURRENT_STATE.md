# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-17 — Mission Workspace V1 na main + Controles de dados (Privacidade)

## Fase

Runtime + Agent Loop + Filesystem + Cockpit + Autonomia V1.1 + DoD + Pending Intents → **VERIFIED**.
Background Execution V1 → **IMPLEMENTED**.
Smart Long-Input / Artifacts → **VERIFIED**.
Controles de dados (Privacidade) → **IMPLEMENTED** (main).
**Mission Workspace V1** (plano + View + gate de falha + intent no chat) → **IMPLEMENTED** (main, 2026-09-17).

## Matriz

| Área | Status |
|------|--------|
| Durable Runtime & Checkpoints | **VERIFIED** |
| Agent Loop & Tool Dispatcher | **VERIFIED** |
| Model Groq + Local | **VERIFIED** |
| Evidence / DoD gate | **VERIFIED** |
| Filesystem Tool V1 | **VERIFIED** |
| Pending Intents offline | **VERIFIED** |
| Background autonomous-run (servidor) | **IMPLEMENTED** |
| Artifacts + Long Input | **VERIFIED** |
| Toggle layout mobile ↔ desktop | **IMPLEMENTED** |
| Brand mark + home polida | **IMPLEMENTED** |
| Configurações completas (Modelos, Conta, Notificações, Privacidade, Sobre) | **IMPLEMENTED** |
| Data controls (export, delete, toggles opt-in) | **IMPLEMENTED** |
| Mission Workspace V1 (plan / align / failure loop / chat UI) | **IMPLEMENTED** |
| Auto create_plan a partir do LLM no chat | **PENDENTE** |
| Tools reais → eventos da View | **PENDENTE** |
| Lixeira + recibo de exclusão | **PENDENTE** |
| Computador / browser virtual | **PENDENTE** |

## Mission Workspace V1 (2026-09-17)

Ciclo de produto:

`conversa → intenção → alinhamento → execução → artefato + evidência`

- Plano em `missions.plan` (JSON v1): steps, events, `aligned`
- Gate: passo N+1 só com N em `PASSED`
- Loop: `FAILED → INSPECTING → FIXING → TESTING → PASSED`
- API: `GET/PATCH /api/missions/:id/plan`
- UI: planejador + View acima do input do chat; seletor de missão
- Chat system prompt: intent chat | mission | project | config

Sem migration Neon nesta fatia.

## Controles de dados (2026-09-17)

- Aba Privacidade em Configurações
- Toggles opt-in (localStorage)
- DELETE `/api/artifacts`
- Export / limpar conversas / exclusão de conta (fluxo com confirmação)

## Autonomia V1.1 / Background V1

Inalterados: `▶ Executar` + `/autonomous-run` no servidor.

## Offline / Pending Intents

Migration `0002` no Neon + smoke OK (2026-09-16).

## Próximos marcos

1. Ligar runtime/tools aos eventos da View (execução ao vivo de verdade)
2. Auto `create_plan` a partir do alinhamento no chat
3. Lixeira V1 + recibo de exclusão
4. Validar Background Execution V1 fechando a aba no meio do request
5. Computador / browser virtual (fase posterior)
