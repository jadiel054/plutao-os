# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-11

## Fase

**Phase 1 — Foundation** → **VERIFIED**  
**Phase 2 — Mission Core** → **VERIFIED** (lifecycle + tasks + evidence)  
**Phase 3 — Durable Runtime** → **VERIFIED** (prod 2026-09-11)

## Matriz

| Área | Status |
|------|--------|
| Neon + /api/health | VERIFIED |
| Auth | VERIFIED |
| Mission lifecycle | VERIFIED |
| Tasks + Evidence | VERIFIED |
| Executions (start/checkpoint/pause/interrupt/resume) | **VERIFIED** |
| Idempotência (start não duplica run ativo) | **VERIFIED** |
| Recovery após interrupt | **VERIFIED** |
| Isolamento (401 / cross-user 404) | VERIFIED |
| package-lock.json | PENDING |
| Agent Loop / LLM / Tools | NOT STARTED |

## Schema

- Baseline 0000 + **0001_executions** (CREATE IF NOT EXISTS; bootstrap em runtime via `ensureExecutionsTable`)
- Tabela `executions`: mission_id, user_id, current_task_id, status, checkpoint jsonb, idempotency_key unique
