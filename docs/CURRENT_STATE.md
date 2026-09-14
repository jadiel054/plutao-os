# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-14 — teste offline mobile

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
| Pending Intents / Fila de Sincronização | **NÃO IMPLEMENTADO** (planejado) |
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

## Próximos marcos

1. Implementar `Pending Intents` e reconciliação se missões criadas offline precisarem sincronizar depois.
2. Implementar execução em background caso a missão precise continuar com o PWA fechado.
3. Atualizar `ARCHITECTURE.md` com a realidade de produção.
