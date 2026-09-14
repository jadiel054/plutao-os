# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-14

## Fase

Runtime + Agent Loop + Filesystem + Cockpit + **Autonomia V1.1** + **DoD gate** → **VERIFIED** em produção.

## Matriz

| Área | Status |
|------|--------|
| Durable Runtime / Loop / Tools | VERIFIED |
| Model Groq `openai/gpt-oss-120b` | VERIFIED |
| Evidence API | VERIFIED |
| Filesystem Tool V1 | VERIFIED |
| ▶ Executar missão (ciclo + steps) | VERIFIED |
| Auto runtime complete + VERIFYING + COMPLETED se DoD OK | **VERIFIED** (prod, AUTO_V11) |
| DoD `GET/POST /api/missions/:id/verify` + gate COMPLETED | **VERIFIED** |
| MissionDoDPanel (componente) | IMPLEMENTED (wire UI pendente) |
| OfflineBanner | IMPLEMENTED |
| Teste offline formal | **DESIGNED** (`docs/OFFLINE_TEST.md`) |

## Autonomia V1.1 (prod)

Um clique em **▶ Executar missão**:
1. Transições até EXECUTING
2. Runtime + model steps (≤5)
3. Complete runtime
4. → VERIFYING
5. DoD determinístico
6. → COMPLETED se passou

Prova: missão `notes/auto-v11.txt` / `AUTO_V11` → COMPLETED sem cliques manuais extras.

## DoD V1

- `apps/web/src/lib/missions/dod.ts`
- Gate em `PATCH` VERIFYING→COMPLETED
- Escape: `force: true`

## Offline

- Protocolo: `docs/OFFLINE_TEST.md`
- Banner: `OfflineBanner` (ligar no layout/header)
- Princípio: missão não se divide; UI pode degradar; APIs cloud falham de forma controlada

## Próximos marcos

1. Wire `MissionDoDPanel` + `OfflineBanner` no cockpit/layout
2. Executar roteiro `OFFLINE_TEST.md` e marcar VERIFIED com prints
3. Atualizar `ARCHITECTURE.md` com realidade de prod
4. 1 tool nova OU adapter durável (background)
