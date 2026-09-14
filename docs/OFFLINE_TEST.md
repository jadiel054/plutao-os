# Teste manual: offline → online (continuidade de missão)

**Objetivo:** validar o princípio «A conectividade pode desaparecer. A missão continua enquanto existirem capacidades suficientes.»

**Pré-requisitos**
- Produção READY
- Login ok
- Pelo menos uma missão COMPLETED de referência (filesystem)
- Chrome/Android ou desktop com DevTools

---

## Roteiro A — UI sobrevive offline

1. Login → Cockpit (online).
2. Abrir uma missão COMPLETED (timeline + evidence já carregados).
3. Cortar rede:
   - Mobile: modo avião (mantém só o app aberto), **ou**
   - Desktop: DevTools → Network → Offline.
4. **Esperado:**
   - Banner offline visível (após deploy do `OfflineBanner`).
   - Cockpit não “explode”; dados já em memória continuam legíveis.
5. Tentar **▶ Executar missão** em missão nova (ainda offline):
   - **Esperado V1:** falha controlada (API/model indisponíveis) com toast de erro — **não** tela branca.
6. Restaurar rede → recarregar ou reabrir missão.
7. **Esperado:** status/evidence voltam a sincronizar via `GET /api/missions/:id`.

---

## Roteiro B — Handoff de modelo (quando Local/WebGPU estiver ativo)

1. Em Configurações / Mode, se houver modo LOCAL ou híbrido, ativar.
2. Online: criar missão simples de filesystem.
3. Iniciar execução; no meio, ir offline.
4. **Esperado (fase atual):** degradação graciosa ou erro explícito; **MissionId** não muda.
5. Online de novo: recuperar execution recoverable se existir (`GET .../executions`).

> Nota: loop local WebGPU completo ainda é capacidade **IMPLEMENTED/parcial** — o roteiro A é o mínimo VERIFIED que queremos agora.

---

## Roteiro C — Idempotência após reconexão

1. Missão com objective de arquivo único (`notes/offline-recheck.txt` + texto fixo).
2. Executar online até COMPLETED.
3. Offline → tentar ações de runtime (devem falhar limpo).
4. Online → **não** deve duplicar o arquivo de forma destrutiva se re-executar write (filesystem V1 é idempotente no conteúdo).

---

## Evidência para marcar VERIFIED

Registrar:
- Print do banner offline + missão legível
- Toast de erro controlado ao tentar model-step offline
- Print após reconexão com status coerente

Colar links/prints em issue ou em `CURRENT_STATE.md` quando passar.

---

## Resultado observado em produção — Android mobile (14/09/2026)

O teste manual foi executado em Chrome mobile com modo avião. O `OfflineBanner` apareceu, o indicador mostrou `Sem conexão` e a missão `COMPLETED`, timeline, evidências e badge `PASSED` permaneceram legíveis, sem tela branca.

Na primeira versão, ao tentar criar uma missão offline, a ação falhou silenciosamente: não houve toast de erro, estado `PENDING` ou fila de sincronização. A causa foi uma rejeição de `fetch()` sem tratamento no handler de criação. O código foi corrigido, publicado e retestado; a versão atual exibe erro controlado.

Evidências versionadas:

- [`docs/testes/2026-09-14-offline-mobile/evidencia-banner-offline-falha-criar-missao.jpg`](testes/2026-09-14-offline-mobile/evidencia-banner-offline-falha-criar-missao.jpg)
- [`docs/testes/2026-09-14-offline-mobile/relatorio-offline-mobile.md`](testes/2026-09-14-offline-mobile/relatorio-offline-mobile.md)

**Status do roteiro A:** ✅ **VERIFIED** — UI sobrevive offline e a tentativa de criação offline exibe erro controlado sem tela branca. A captura pós-deploy [`evidencia-toast-offline-pos-deploy.jpg`](testes/2026-09-14-offline-mobile/evidencia-toast-offline-pos-deploy.jpg) mostra o toast `Sem conexão: não foi possível criar a missão. Reconecte e tente novamente.`.
