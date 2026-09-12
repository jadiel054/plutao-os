# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-11

## Fase

**Phase 1–3 + Agent Loop + Tool Dispatcher** → **VERIFIED**  
**Model Provider** → **IMPLEMENTED** (aguarda `MODEL_API_KEY` em prod para VERIFIED com chamada real)

## Matriz

| Área | Status |
|------|--------|
| Runtime / checkpoint / recovery | VERIFIED |
| Agent Loop stub | VERIFIED |
| Tool Dispatcher + `note` | VERIFIED |
| Model step `POST /api/executions/:id/model-step` | IMPLEMENTED |
| Model status `GET /api/model/status` | IMPLEMENTED |
| LLM call real em prod | PENDING env `MODEL_API_KEY` |

## Env (Vercel)

```
MODEL_API_KEY=...          # obrigatório para model-step
MODEL_PROVIDER=xai|openai  # default xai
MODEL_NAME=                # default grok-2-latest | gpt-4o-mini
MODEL_BASE_URL=            # opcional
```

## Pipeline

```
Execution → model-step → (optional tool via dispatcher) → Evidence → Checkpoint
```
