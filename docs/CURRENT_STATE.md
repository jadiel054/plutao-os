# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-14

## Fase

Runtime completo (Phases 1–3 + loop + tools + model provider) **VERIFIED** / model real (Groq) **VERIFIED** em produção.
**Agent profile + mission evidence** → **VERIFIED** (prod).
**Cockpit autonomia V1 (Executar missão)** → **VERIFIED** (prod, 2026-09-14).
**DoD determinístico (VERIFYING → COMPLETED)** → **IMPLEMENTED** (API + gate).

## Matriz

| Área | Status |
|------|--------|
| Durable Runtime / Loop / Tools / Cockpit | VERIFIED |
| Model provider (Groq gpt-oss-120b) | VERIFIED |
| `GET/PUT /api/agent` | VERIFIED |
| `GET /api/missions/:id/evidence` | VERIFIED |
| Filesystem Tool V1 | VERIFIED |
| **▶ Executar missão** (ciclo + runtime + model steps) | **VERIFIED** |
| **DoD `GET/POST /api/missions/:id/verify`** | **IMPLEMENTED** |
| **Gate COMPLETED sem evidência** | **IMPLEMENTED** |

## Agent Loop V1 — VERIFIED em produção

Provider: Groq `openai/gpt-oss-120b` via OpenAI-compatible endpoint.

Trace típico (missão auto-ok):
```
model_step → filesystem write → tool_result (path+size)
         → filesystem read  → tool_result (path+content)
         → note / completed text
```

## DoD V1 (determinístico)

- Módulo: `apps/web/src/lib/missions/dod.ts`
- API: `GET|POST /api/missions/:id/verify`
- Gate: `PATCH` transição `VERIFYING → COMPLETED` exige `verifyDefinitionOfDone().passed`
- Escape: `force: true` no body (operador) — uso excepcional
- Critérios:
  - há evidências
  - há tool_result / write / read (não só texto do LLM)
  - se o objective cita path/conteúdo, deve aparecer nas evidências
  - se `definitionOfDone` está preenchido, tokens devem refletir nas evidências

## Como testar DoD

1. Missão com objective de arquivo (ex.: `notes/auto-ok.txt` + `AUTO_OK`)
2. **▶ Executar missão** até evidence de write/read
3. Concluir runtime → **→ VERIFYING**
4. `GET /api/missions/:id/verify` → `passed: true`
5. **→ COMPLETED** (deve aceitar)
6. Missão sem evidence: COMPLETED deve retornar `409 DoD_FAILED`

## Próximos marcos

1. UI no cockpit: painel DoD (checks verdes/vermelhos) + botão Verificar
2. Auto-complete runtime quando o loop termina sem tool proposal
3. Reconciliação offline→online (teste com rede cortada)
4. Atualizar ARCHITECTURE.md com realidade de prod
5. 1 tool nova OU adapter durável (background)
