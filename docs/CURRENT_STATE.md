# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-16 — Pending Intents VERIFIED + Background Execution V1 (server autonomous-run)

## Fase

Runtime + Agent Loop + Filesystem + Cockpit + **Autonomia V1.1** + **DoD gate** + Pending Intents → **VERIFIED** em produção.
Background Execution V1 (ciclo no servidor) → **IMPLEMENTED** (validar em prod).

## Matriz

| Área | Status |
|------|--------|
| Durable Runtime & Checkpoints (save/restore) | **VERIFIED** |
| Agent Loop & Tool Dispatcher | **VERIFIED** |
| Model Groq `openai/gpt-oss-120b` | **VERIFIED** |
| Model Local (`Transformers.js` + WebGPU / CPU fallback) | **IMPLEMENTED / VERIFIED** |
| Evidence API & Trace Logging | **VERIFIED** |
| Filesystem Tool V1 (list, read, write, mkdir, stat) | **VERIFIED** |
| Isolamento de Dados por Usuário (`userId`) | **VERIFIED** |
| ▶ Executar missão (ciclo + steps) | **VERIFIED** |
| Auto runtime complete + VERIFYING + COMPLETED se DoD OK | **VERIFIED** (prod, AUTO_V11) |
| DoD `GET/POST /api/missions/:id/verify` + gate COMPLETED | **VERIFIED** |
| MissionDoDPanel (componente) | **VERIFIED** (conectado na UI do Cockpit) |
| OfflineBanner & Header Indicator | **VERIFIED** |
| Teste offline formal (mobile prod) | ✅ **VERIFIED** (`docs/OFFLINE_TEST.md`) |
| Erro controlado ao interagir offline (toast sem crash) | ✅ **VERIFICADO EM PRODUÇÃO** |
| Pending Intents / Fila de Sincronização (Marco A+B) | **IMPLEMENTED / VERIFIED** |
| Execução em background com PWA fechado | **PARCIAL (V1)** — ciclo no servidor (`/autonomous-run`); SW fechado ainda não |

## Autonomia V1.1 (prod)

Um clique em **▶ Executar missão**:
1. Transições até EXECUTING
2. Runtime + model steps
3. Complete runtime
4. → VERIFYING
5. DoD determinístico
6. → COMPLETED se passou

Prova: missão `notes/auto-v11.txt` / `AUTO_V11` → COMPLETED sem cliques manuais extras.

## Background Execution V1 (2026-09-16)

- Endpoint `POST /api/missions/:id/autonomous-run` executa o ciclo Autonomia V1.1 **no servidor** (transições → execution → agent loop → VERIFYING → DoD → COMPLETED).
- O client (`runAutonomousMission`) prefere esse endpoint; fallback legado step-by-step se a rota não existir.
- Fechar a aba **durante o request** não cancela o trabalho no servidor (até o `maxDuration` da Vercel, até 300s no plano que permitir).
- **Ainda NÃO é:** Service Worker rodando com PWA completamente morto, nem Inngest/BullMQ.

## DoD V1

- `apps/web/src/lib/missions/dod.ts`
- Gate em `PATCH` VERIFYING→COMPLETED
- Escape: `force: true`

## Offline

- Protocolo: `docs/OFFLINE_TEST.md`
- Banner: `OfflineBanner` **VERIFICADO em produção no mobile**
- Pending Intents: criar missão offline → reconciliar online → **VERIFIED** (2026-09-16)

## Marco A+B — Pending Intents & Reconciliação (IMPLEMENTED / VERIFIED)

- Contrato + IndexedDB + reconciler + migration `0002` no Neon aplicada e smoke test OK.

## Operação pós-merge (2026-09-16)

- Migration `0002` aplicada no Neon (SQL Editor).
- Smoke Pending Intents: 9 → offline pendente → online 10, sem duplicata.

## Próximos marcos

1. Validar Background Execution V1 em produção (▶ Executar e fechar aba no meio).
2. Durable Execution Adapter (Inngest/BullMQ) além do timeout serverless.
3. Smart Long-Input / Artifacts V1 (PR #2).
