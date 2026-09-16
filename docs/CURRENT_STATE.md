# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-16 — Pending Intents & Reconciliação (Migration Versionada)

## Fase

Runtime + Agent Loop + Filesystem + Cockpit + **Autonomia V1.1** + **DoD gate** → **VERIFIED** em produção.

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
| Execução em background com PWA fechado | **NÃO IMPLEMENTADO** (planejado) |

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
- Banner: `OfflineBanner` **VERIFICADO em produção no mobile**
- Princípio: missão não se divide; UI pode degradar; APIs cloud falham de forma controlada
- Evidência: [`docs/testes/2026-09-14-offline-mobile/evidencia-banner-offline-falha-criar-missao.jpg`](testes/2026-09-14-offline-mobile/evidencia-banner-offline-falha-criar-missao.jpg)
- Relatório: [`docs/testes/2026-09-14-offline-mobile/relatorio-offline-mobile.md`](testes/2026-09-14-offline-mobile/relatorio-offline-mobile.md)

### Resultado real do teste offline mobile

- ✅ Banner `Offline — a interface continua...` apareceu.
- ✅ Indicador do cabeçalho mostrou `Sem conexão`.
- ✅ Missão `COMPLETED`, timeline, evidências e DoD permaneceram legíveis.
- ✅ Não ocorreu tela branca.
- ❌ Criar missão offline falhou silenciosamente: não houve toast, estado pendente ou fila de sincronização.
- ✅ Correção publicada e verificada em produção: falhas de rede agora exibem toast/erro controlado; não houve tela branca.
- 📸 Evidência pós-deploy: [`evidencia-toast-offline-pos-deploy.jpg`](testes/2026-09-14-offline-mobile/evidencia-toast-offline-pos-deploy.jpg)

## Marco A+B — Pending Intents & Reconciliação (IMPLEMENTED / VERIFIED)

- **Contrato & Idempotência (`@plutao/domain`, `/api/missions`):** `PendingIntent` com UUID, `intentId`, `userId`, `idempotencyKey`, `type`, `payload`, `status` (`PENDING`, `SYNCING`, `APPLIED`, `FAILED_RETRYABLE`, `FAILED_PERMANENT`), tentativas, logs de erro e timestamps. O endpoint POST `/api/missions` garante atomicidade real através de restrição única no banco de dados (`userId`, `idempotencyKey`) via migration versionada `packages/db/drizzle/0002_missions_idempotency_key.sql` capturando violações `23505` para responder de forma idempotente.
- **Armazenamento Persistente Local (`PendingIntentStore`):** IndexedDB nativo (`plutao_offline_db`), isolamento estrito por `userId`.
- **Reconciliador Online (`Reconciler` & `usePendingIntents`):** Detecção automática de retorno de conectividade (`online`), trava de concorrência em memória por aba, backoff exponencial limitado com teto (5s, 15s, 45s, max 120s), e recuperação de `SYNCING` órfão travado após timeout de 60s.
- **Cockpit UI Integration:** Exibição clara de missões "Pendente de sincronização" na interface sem falsas confirmações de persistência remota prévia.
- **Evolução de Schema:** Modificações de schema em runtime foram completamente removidas de `apps/web/src/lib/runtime/ensure.ts`. A evolução do banco é gerida exclusivamente por migrations Drizzle versionadas (`0000_baseline`, `0001_executions`, `0002_missions_idempotency_key`).

## Próximos marcos

1. Implementar execução em background caso a missão precise continuar com o PWA fechado.
2. Expansão do Agent Loop para suporte a Background Workers (Inngest/BullMQ).
