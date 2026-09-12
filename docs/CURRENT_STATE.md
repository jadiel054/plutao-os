# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-12

## Fase

Runtime completo (Phases 1–3 + loop + tools + model provider) **VERIFIED** / model real **PENDING key**.  
**Agent profile + mission evidence** → **VERIFIED** (prod).

## Matriz

| Área | Status |
|------|--------|
| Durable Runtime / Loop / Tools / Cockpit | VERIFIED |
| Model provider code | IMPLEMENTED |
| LLM real | PENDING `MODEL_API_KEY` |
| `GET/PUT /api/agent` | **VERIFIED** |
| `GET /api/missions/:id/evidence` | **VERIFIED** |
| Agent no system prompt do model-step | IMPLEMENTED |

## Próximo marco recomendado

Teste controlado com key: mission → execution → model step → tool → evidence → checkpoint.
