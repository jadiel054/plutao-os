# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-17 — **1.3 Stop-mission IMPLEMENTADO** → próximo: MCP GitHub (M1)

## Fase

Kernel de missão (Workspace + tools→View + auto-plan + **stop**) → **IMPLEMENTED**.
Próximo foco de produto: **conectores MCP OAuth (GitHub 1º)**.

## Matriz

| Área | Status |
|------|--------|
| Durable Runtime & Checkpoints | **VERIFIED** |
| Agent Loop & Tool Dispatcher | **VERIFIED** |
| Mission Workspace V1 + tools→View | **IMPLEMENTED** |
| Auto suggestedPlan (1.2) | **IMPLEMENTED** |
| **Stop-mission / cancel (1.3)** | **IMPLEMENTED** |
| Conectores MCP + OAuth (GitHub 1º) | **PENDENTE** — **próximo** |
| Painel de conectores | **PENDENTE** |
| Bridge MCP → dispatcher | **PENDENTE** |
| /ajuda e /legal originais | **DEFERIDO** |
| Lixeira | **DEFERIDO** |
| Browser virtual | **DEFERIDO** |

## 1.3 Stop-mission (feito)

- Status de execução **`CANCELLED`** (terminal; libera `idempotency_key`)
- `stopExecution` / `stopMissionExecution` em `lib/runtime/service.ts`
- Agent loop já checa `RECOVERABLE` a cada iteração → para na próxima volta
- `POST /api/missions/:id/stop` — para run ativo + evento `stopped` no plano
- `PATCH /api/executions/:id` action `stop`
- View: botão **Parar missão** chama stop real (não só append_event)

## Rota até MCP ao vivo

| # | Marco | Status |
|---|--------|--------|
| 1.3 | Stop-mission | **DONE** |
| **M1** | Domain + schema conectores | **NEXT** |
| M2 | OAuth GitHub (estados completos) | PENDENTE |
| M3 | UI painel conectores | PENDENTE |
| M4 | Bridge MCP → dispatcher + View | PENDENTE |
| M5 | Smoke end-to-end | PENDENTE |

## Próximo passo imediato

**M1 — Domain + schema de conectores** (status, tokens cifrados, migration Drizzle), depois M2 OAuth GitHub.
