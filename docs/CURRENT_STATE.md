# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-11

## Fase

**Phase 1 — Foundation** → **VERIFIED** (prod health + brand + Auth)  
**Phase 2 — Mission Core** → **IN PROGRESS** (create / list / cancel + cockpit)

## Matriz

| Área | Status |
|------|--------|
| Neon + /api/health prod | VERIFIED |
| Brand PNGs PWA | VERIFIED |
| Auth register/login/session | IMPLEMENTED |
| Mission create/list/cancel | IMPLEMENTED |
| Cockpit `/cockpit` | IMPLEMENTED |
| package-lock.json | PENDING commit se CI exigir |
| Mission lifecycle completo | NOT STARTED |
| Durable Runtime | Phase 3 |

## Neon

Não rodar migrate/stamp/drop sem aprovação. Auth e Mission usam tabelas já existentes.
