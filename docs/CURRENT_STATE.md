# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-11

## Fase

**Phase 1 — Foundation** → **VERIFIED**  
**Phase 2 — Mission Core** → **IN PROGRESS** (lifecycle + tasks + evidence mínima)

## Matriz

| Área | Status |
|------|--------|
| Neon + /api/health prod | VERIFIED |
| Brand / PWA | VERIFIED |
| Auth (register/login/session) | VERIFIED |
| Mission create/list/cancel + lifecycle | VERIFIED |
| Tasks (CRUD + transitions) | IMPLEMENTED → verificar prod |
| Evidence mínima (mission.evidence jsonb) | IMPLEMENTED → verificar prod |
| Cockpit (missions + tasks + evidence) | IMPLEMENTED |
| package-lock.json | PENDING |
| Agent / Durable Runtime | Phase 3+ |

## Schema Neon (sem migrate nesta fatia)

- `tasks` — tabela baseline já existente
- `missions.evidence` — jsonb array; itens com `{id,type,content,source,taskId,missionId,createdAt}`

Não rodar migrate/stamp/drop sem aprovação.
