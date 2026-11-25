# Computador do Plutão — arquitetura

> Estado atual (fases 1–5 do Computador real):
>  - ABSTRAÇÃO de provedor implementada (`ComputerProvider`): browserless E
>    self-hosted, trocável por ambiente sem mexer no Chat.
>  - ADAPTADOR Browserless Free implementado (CDP/Playwright, screencast real,
>    input real). Válido APENAS com BROWSERLESS_API_TOKEN configurado no
>    servidor; sem token o produto permanece no modo preview de sandbox.
>  - Sessão REAL AINDA NÃO VALIDADA em execução com token — o teste de
>    integração real existe (apps/web/src/lib/computer/__tests__/
>    browserlessIntegration.test.ts) e roda com token. Não apresentar como
>    concluído até validar uma sessão real de ponta a ponta no Vercel.
>  - Migração `computer_sessions`: NÃO aplicada (proposta em
>    docs/DB_PROPOSTA_COMPUTER_SESSIONS.md — auditoria pelo ChatGPT).

## O que já está implementado e é real

| Capacidade | Como funciona |
|---|---|
| Máquina da conversa | Sandbox de arquivos namespaceado `userId__conversationId` (persistente com `FILESYSTEM_STORAGE_TYPE=local`) |
| Terminal real | Tool `process`: spawn sem shell, allowlist (node/npm/npx/git/ls/cat/echo/mkdir/touch/mv/cp), denylist (rm/sh/bash/curl/chmod...), env limpo, timeout e teto de saída |
| Eventos ao vivo | Cada passo do runtime grava `action`/`observation`/`state_update` em `conversation_events` (append-only, seq monotônico, scrub); SSE `/api/conversations/:id/events/stream` com replay por cursor (Last-Event-ID) |
| Estado do computador | `state_update` real do runtime: working → completed/error; nunca simulado |
| Preview do app | `/api/computer/:id/screen` lê o HTML real do sandbox; iframe sandboxado (`allow-scripts allow-forms`, sem same-origin/top-navigation) — interativo |
| Controle exclusivo | `lib/chat/computer.ts`: controlador = último evento `computer` legível por TODAS as instâncias (storage em `conversation_events` — last-write-wins por seq); takeover humano expira por TTL de 30 min |
| Pausa do agente | `runChatBuildFlow` re-checa o controle no topo do loop, após a chamada ao modelo e antes de executar cada tool — tool proposta durante takeover humano NÃO executa |
| Concorrência | Lock em-processo por conversa (`tryAcquireConversationBuild`) impede fluxos paralelos na mesma instância |

## Arquitetura necessária para computador remoto real (Chromium)

O objetivo: acompanhar um navegador real trabalhando e assumir mouse/teclado.
Serverless Vercel não comporta Chromium persistente (sem processo durável).
A arquitetura proposta:

```
┌────────────┐  HTTPS/WS (proxy autenticado)  ┌─────────────────────────┐
│ Chat UI    │ ─────────────────────────────▶ │ Plutão API (Vercel)     │
│ (browser)  │ ◀───────────────────────────── │   auth + mediação       │
└────────────┘   frames de tela / input        └───────────┬─────────────┘
                                               │            │
                                    WS interno │            │ control plane
                                               ▼            ▼ (conversation_events)
                                    ┌──────────────────────────┐
                                    │ Chromium Worker dedicado │
                                    │  - container c/ Chromium │
                                    │  - Playwright (CDP)      │
                                    │  - screencast→WS frames  │
                                    │  - input dispatch        │
                                    │  - FFmpeg opcional (H264)│
                                    └──────────────────────────┘
```

### Componentes

1. **Worker dedicado (container/VM)** — Render/Fly.io/Fargate. Executa Chromium
   headless (ou headed com Xvfb) e Playwright gerenciando páginas por sessão.
2. **Transporte de tela**
   - Opção A (mais simples): CDP Screencast (`Page.startScreencast`) — frames
     JPEG/PNG via WebSocket do worker → API Vercel (proxy autenticado) → UI.
   - Opção B (fluído): WebRTC com stream H264 via FFmpeg — mais eficiente em
     latência; exige TURN próprio. Recomendado iniciar com A.
3. **Input** — eventos de mouse/teclado da UI → WS → worker → CDP
   `Input.dispatchMouseEvent`/`dispatchKeyEvent`. Sem simulação: quem move é
   o Chromium real da sessão.
4. **Sessões** — `computer_sessions`: id, ownerId, conversationId, status,
   ttl/lastSeen. Reconexão: cliente reabre WS com sessionId; worker mantém a
   página viva; o sandbox de arquivos da conversa é o armazenamento do projeto.
5. **Takeover (control plane já implementado)** — o worker acompanha os
   eventos `source:"computer"` da conversa; com `controller:"human"` ele
   suspende automação agêntica e encaminha input humano; com devolução/TTL
   retoma. O worker nunca executa automação enquanto o humano controla.
6. **Segurança** — o worker nunca é público: apenas a API Plutão fala com ele
   (auth de usuário + verificação de ownership da conversa); navegador isolado por sessão
   com network policy; segredos nunca entram no contexto do navegador.
7. **Ciclo de vida** — sessões com TTL e encerramento em idle; job de limpeza
   de máquinas órfãs (mesma disciplina do runtime de jobs de missão).

### O que falta para implementar

- Provisionar o worker (infra externa à Vercel, custo recorrente).
- WS de mídia entre worker e Vercel (ou cliente) — URLs autenticadas de curta
  duração.
- Registro `computer_sessions` (nova migration, aplicada apenas após
  validação pelo ChatGPT no Neon).
- Integração do build flow do chat com o worker (o protocolo de eventos já é
  a fundação do takeover).

## Limitações atuais (honestas)

1. Execução de desenvolvimento no Chat é em-processo: morte do processo
   descarta etapas em voo; arquivos, eventos e histórico persistem e a
   conversa retoma. Retomável passo-a-passo de verdade = runtime de missões
   (Cockpit).
2. Mouse/teclado hoje válidos: terminal allowlistado, editor de arquivos do
   sandbox e interação direta no preview do app (não é navegador remoto).
3. Lock de build entre instâncias distintas: garantia total exigiria a fila
   durável; o lock em-processo cobre o caso dominante.

---

## Fases 1–5 — implementação do Computador real (esta PR)

### Contrato independente de provedor (Fase 1)

`apps/web/src/lib/computer/provider.ts` — `ComputerProvider` único para
`browserless` e `self-hosted`: criar sessão, snapshot de estado, reconectar,
encerrar, info de conexão autorizada, ações reais de navegador (mouse humano,
teclado, scroll, navegação), screencast real (frames) e CAS exclusivo de
controle agente × humano. O Chat conhece APENAS este contrato; trocar de
provedor é mudar `PLUTAO_COMPUTER_PROVIDER` — nenhum ajuste de UI/fluxo.

### Adaptador Browserless Free (Fase 2) — capacidades verificadas na documentação oficial (docs.browserless.io, nov/2026)

| Capacidade | Free | Como o Plutão usa |
|---|---|---|
| Chromium real via CDP | ✅ | `wss://…/chromium?token=` + `playwright-core.connectOverCDP` |
| Screencast (tela em movimento) | ✅ (CDP padrão) | `Page.startScreencast` frames JPEG → SSE autenticado do Plutão |
| Mouse/teclado humanos | ✅ (CDP padrão) | `Input.dispatchMouseEvent`/`dispatchKeyEvent` recebidos do usuário autorizado |
| Reconexão | ⚠️ | No Free a reconexão ABRE UM NAVEGADOR NOVO e o estado do navegador NÃO sobrevive (sessões persistentes são de plano pago). Estado que sobrevive: sandbox de arquivos da conversa |
| Duração da sessão | ⚠️ 2 min por conexão | TTL do Plutão (110s) abaixo do teto; renovação via nova conexão |
| Concorrência | 2 navegadores | O Plutão usa 1 sessão simultânea por instalação |
| Cota | 1.000 unidades/mês (≈8h; 1 un = 30s) | Sem overage: conexões novas são RECUSADAS (429) — o gerenciador bloqueia novas sessões (QUOTA_EXHAUSTED) |
| Live URL interativo | ✅ existe no Free | NÃO usado: é URL pública por portador; abriria canal de controle fora do controle de acesso do Plutão |
| Screen Recording (WebM) | ❌ pago | Não usado |

### Experiência no Chat (Fase 3)

`RealComputerView` (dentro do computador da conversa): estado da conexão,
tela real do Chromium (frames CDP via `/api/computer/:id/screen/stream` SSE),
atividade do agente (eventos duráveis existentes), assumir/devolver controle,
encerrar com confirmação, estado de reconexão/erro. Input humano real só com
controle humano ativo (`/api/computer/:id/session/input` → CDP). O bloco
“Preview do app · sandbox da conversa” **continua sendo preview**, rotulado
como preview — nunca como computador real.

### Segurança e limites (Fase 4)

- 1 sessão simultânea por instalação: gate atômico no STORE DURÁVEL
  (`lib/computer/store.ts`) — INSERT contra o `índice único parcial
  ((1)) WHERE closed_at IS NULL` na tabela `computer_sessions` (Neon);
  importar um número maior de instâncias Vercel não abre segunda sessão
  (23505 ⇒ SESSION_LIMIT). Sem a tabela, degrada para memória com
  `persist.degraded = true` avisado na UI (nenhum DDL executado pelo app).
- Autorização por usuário + conversa em TODA rota (ownership).
- Segredos apenas no servidor; `view()`/`connectionInfoFor()` não contêm
  token, host do provedor nem URL com credencial (testado).
- Exclusividade de controle por compare-and-set — o last-write-wins dos
  eventos do PR #203 é APENAS o acompanhamento observável, não a garantia.
- Lease/TTL: sessões abandonadas expiram (padrão 110s, teto do Free 2 min) e
  são encerradas; encerramento é verificado por todos os acesso.
- Cota DURÁVEL: `units_used` cumulativo por sessão em `computer_sessions`
  (`GREATEST(units_used, valor)` — só o dono do canal reporta, sem duplicar
  contagem entre instâncias); bloqueio de novas sessões por
  `SUM(units_used) WHERE billing_month = mês` >= budget. Reconexão, expiração
  e encerramento somam na mesma conta mensal. Sem cobrança automática.
- Segurança do controle humano: cada ação de mouse/teclado/scroll/navegação
  é executada sob LOCK RENOVÁVEL (`human_action_until` — lease de ~5s
  renovado pelo dono do canal durante TODA a execução, pois uma navegação
  pode durar 30s) com liberação GARANTIDA no `finally` (sucesso, erro ou
  cancelamento); enquanto o lock está vivo, a devolução do controle é
  RECUSADA (409 ACTION_INFLIGHT) — provado em teste com TTL 200ms e ação de
  500ms: a devolução só passa depois do fim da ação.
- Confirmação (window.confirm) para encerrar sessão; navegação restrita a
  http/https PÚBLICOS: `lib/computer/urlGuard.ts` bloqueia loopback,
  redes privadas (10/8, 172.16/12, 192.168/16), link-local de metadata
  (169.254.169.254), CGNAT, hosts `.local/.internal/.localhost`, IPv6
  privado/mapeado e formas opacas de loopback (`0177.0.0.1`,
  `2130706433`) — na API e no provedor.

**Arquitetura serverless (control plane × canal vivo):** metadados da sessão
ficam no Neon (`computer_sessions` — proposta em
`docs/DB_PROPOSTA_COMPUTER_SESSIONS.md`); o canal vivo do Chromium (CDP,
screencast, input) é da instância que abriu o navegador, com lease de 30s
renovado por heartbeat do SSE/input. Outra instância assume o canal quando o
lease expira — reabrindo o navegador com o MESMO id durável (no Free isso é
um navegador NOVO; estado de navegador perdido, avisado na UI). Canal ocupado
→ rotas respondem 409 CHANNEL_BUSY e a UI explica o aguardo. Salvaguarda
adicional: o plano Free tem 2 navegadores por vez e recusa conexões
excedentes (429).

**Limitação HONESTA e caminho definitivo (worker persistente):** o lease NÃO
compartilha a conexão CDP viva — Browser, Page e frames continuam na memória
da instância Vercel que abriu a sessão. No Free isso significa que
"recuperação" entre instâncias = abrir OUTRO navegador (nunca é recuperação
do anterior; o anterior expira no teto de 2 min e entra no ledger pelo sweep).
A solução definitiva é tirar o Chromium da Vercel:

1. **Worker persistente** (identidade `self-hosted` já preparada no
   `providers/self-hosted.ts`): um processo ÚNICO dono do Chromium/CDP,
   screencast e input. Opções a US$ 0/mês — mini PC próprio (já aprovado
   como alternativa futura) ou VM de free tier (ex.: Oracle Always Free,
   GCP e2-micro free). NENHUMA contratação automática; escolha e aprovação
   ficam com você.
2. **Vercel coordena, não executa:** autentica o usuário + ownership da
   conversa, aplica o control plane durável (Neon) e encaminha comandos ao
   worker via endpoint HTTPS autenticado (token compartilhado em variáveis
   de ambiente dos dois lados; túnel como Cloudflare Tunnel para não abrir
   portas — sem URL pública do worker em nenhuma view).
3. **Re-attach REAL:** `createSession({sessionId})` no worker procura o
   navegador VIVO por id durável e devolve O MESMO Process (recuperando o
   estado — ao contrário do Free, que abre navegador novo). Uma linha viva
   por instalação continua garantida pelo índice parcial do Neon; o navegador
   anterior nunca fica órfão consumindo cota (o worker encerra o processo
   quando a linha fecha/expira ou o lease de canal muda de dono).
4. **Egress no worker (SSRF de verdade):** política de REDE no host do
   worker — nftables/private ranges + DNS pinning (resolvedor recursivo
   próprio com allowlist), bloqueando loopback, RFC1918, link-local e
   metadata em TODAS as requisições (redirecionamentos e secundárias
   incluídos). O guard `urlGuard.ts` + interceptação CDP `Fetch` no app são
   primeira linha de defesa; a garantia dura é no worker.

### Preparação para mini PC (Fase 5)

`providers/self-hosted.ts` fala o MESMO protocolo CDP (browserless docker no
mini PC). Configuração only: `SELF_HOSTED_COMPUTER_ENDPOINT` (+ token
opcional, `SELF_HOSTED_MAX_SESSION_MS`). Enquanto o endpoint não existir,
reserva recusa com `PROVIDER_UNCONFIGURED`. Nenhuma infra foi provisionada
de propósito.

### Variáveis de ambiente (apenas NOMES — valores sempre no servidor)

- `PLUTAO_COMPUTER_PROVIDER` — `browserless` (default) | `self-hosted`
- `BROWSERLESS_API_TOKEN` — token do Browserless (server-only)
- `BROWSERLESS_ENDPOINT` — default `wss://production-sfo.browserless.io/chromium`
- `BROWSERLESS_MAX_SESSION_MS` — default 110000 (teto do Free: 120000)
- `PLUTAO_COMPUTER_MONTHLY_UNITS` — default 1000 (orçamento do Free)
- `SELF_HOSTED_COMPUTER_ENDPOINT`, `SELF_HOSTED_COMPUTER_TOKEN`,
  `SELF_HOSTED_MAX_SESSION_MS` — futuro mini PC

### Testes (requisito 9) — o que foi validado DE VERDADE

| # | Requisito | Status | Onde |
|---|---|---|---|
| A | criar/encerrar sessão | ✅ real na lógica (mock do provedor); navegação real coberta no teste de integração real | sessionManager.test.ts |
| B | bloquear 2ª sessão simultânea | ✅ inclui janela de corrida (reserving) E gate cross-instance (2 gerenciadores, 1 store) | sessionManager + store.test.ts |
| C | acesso negado a outra conversa/usuário | ✅ | sessionManager.test.ts |
| D | agente pausa no controle humano | ✅ no loop real do buildRunner (sessão remota mockada) | computerRealSession.test.ts |
| E | agente retoma após devolver | ✅ mesmo caminho | computerRealSession.test.ts |
| F | nenhum controle simultâneo | ✅ CAS DURÁVEL no store + guarda de ação humana (release recusado com input em andamento) | sessionManager + store.test.ts |
| G | desconexão/reconexão | ⚠️ lógica + contrato; rede real só no teste de integração | sessionManager + browserlessIntegration |
| H | cota gratuita esgota → bloqueia | ✅ conta DURÁVEL no store (sem duplicação entre instâncias) | sessionManager + store.test.ts |
| I | nenhum segredo no frontend/logs/eventos | ✅ view/connectionInfo sem token/host (assertions sobre String serializada) | sessionManager.test.ts |
| J | trocar Browserless → self-hosted sem mudar o Chat | ✅ | sessionManager.test.ts |
| — | Chromium real E2E | ✅ teste de integração real (roda só com `BROWSERLESS_API_TOKEN`; pulado sem token — honesto sobre isso) | browserlessIntegration.test.ts |

Executado nesta sandbox (última rodada da suíte completa, 2ª auditoria):
**738 testes passando + 17 pulados em 126 arquivos** (inclui os 11 testes do
simulador fiel do driver Neon HTTP em `neonStore.test.ts`), typecheck
`tsc --noEmit` limpo, ESLint 0 erros (2 avisos conhecidos de `<img>` no
preview), `next build` OK. Nenhum teste com token real — a validação
rede+Chromium fica explícita como pendência para execução com token.

## Correções da auditoria da PR #204 (itens 1–7)

1. **Persistência serverless** — novo `lib/computer/store.ts`: control plane
   durável (Neon, `SessionStore`) SEPARADO do canal vivo (data plane por
   instância com lease). `MemorySessionStore` implementa as MESMAS
   semânticas (testes/fallback); `NeonSessionStore` é SQL cru via
   `db.execute` (sem DDL); `ResilientSessionStore` degrada com honestidade
   (42P01 ⇒ memória + `persist.degraded` na UI).
2. **Índice da sessão única corrigido** — `((1)) WHERE closed_at IS NULL`
   (ver proposta atualizada); o antigo `UNIQUE (status) WHERE status IN (...)`
   permitia várias linhas vivas e foi descartado.
3. **Cota durável** — conexões, reconexões, expirações e consumo mensal são
   linhas/colunas em `computer_sessions` (`units_used`, `billing_month`),
   atualizadas por GREATEST e bloqueadas por SUM; nada em memória.
4. **Ciclo de vida do Free** — TTL do Plutão 110s (< teto de 2 min); a UI
   mostra contagem regressiva nos últimos ~30s, banner de que reconexão abre
   navegador novo e de modo degradado/canal ocupado. Nada de "sessão
   persistente ou ilimitada".
5. **Controle humano** — lock renovável de ação em andamento
   (`human_action_until`: lease ~5s RENOVADO durante toda a ação, liberado no
   `finally`); CAS durável executado SEMYPRE que houver sessão real
   (qualquer instância — o canal local deixou de ser pré-condição); nav
   bloqueada para endereços internos/privados em `urlGuard.ts` (API +
   provedor) e interceptação CDP `Fetch` cobre redirecionamentos e
   requisições secundárias (egress de rede é garantia do worker).
6. **Teste real** — PENDENTE e documentado como tal: `browserlessIntegration.test.ts`
   está preparado (Chromium real, screencast, input, reconexão, encerramento)
   e roda automaticamente com `BROWSERLESS_API_TOKEN` presente; sem a
   credencial, pula e a doc NÃO marca a integração como validada.
7. **Processo** — mesma branch/PR #204, sem merge, sem deploy, sem tocar no
   Neon (nada de SQL/migration executado).

## Correções da 2ª auditoria (bloqueadores 1–8)

1. **SQL — decisões por linha retornada (PRIORIDADE MÁXIMA):** os UPDATEs que
   decidem comportamento (`casController`, `setHumanActionInflight`,
   `attachChannel`, `renewChannel`) checavam `result.rows.length` SEM
   `RETURNING` — com o driver Neon HTTP isso é SEMPRE falso negativo
   (`rows: []`). Corrigido com `RETURNING id` + verificação das linhas
   retornadas. `sweepExpired` também virou `RETURNING id` (contagem real de
   linhas expiradas). Testes novos (`neonStore.test.ts`) rodam contra um
   simulador do formato REAL do driver: `db.execute` recebe a query
   compilada do drizzle (text + params via `PgDialect.sqlToQuery`) e UPDATE
   sem `RETURNING` devolve `{rows: [], rowCount: 1}` — linhas vindas por
   UPDATE vêm SEMPRE do `RETURNING`.
2. **Canal CDP entre instâncias — limitação documentada + worker
   persistente:** a conexão CDP/Browser/Page NÃO atravessa instâncias (lease
   coordena posse, não compartilha memória). No Free, "assumir de outra
   instância" = navegador NOVO (nunca recuperação do anterior — o anterior
   expira em ~2min e o consumo entra no ledger pelo sweep). Arquitetura
   definitiva proposta (US$ 0/mês, sem contratação automática): worker
   persistente único dono do Chromium/CDP/screencast/input (mini PC próprio
   — já aprovado como alternativa futura; ou VM free tier), Vercel apenas
   autenticando/coordenando via HTTPS autenticado, re-attach REAL por id
   durável no MESMO Process do worker, e política de egress de REDE no
   worker. Detalhado na seção "Limitação HONESTA e caminho definitivo" acima.
3. **Takeover/release 100% durável:** a rota de controle agora executa o CAS
   do SEMPRE que exista sessão real — com canal local OU em outra instância
   (`computerSessions.takeHumanControl/releaseToAgent` incondicionais); só
   cai para coordenação por eventos quando NÃO há sessão real. O evento de
   conversa nunca substitui o CAS do banco. GET também dá precedência ao
   controller durável.
4. **Lock renovável de ação humana:** fim do TTL fixo de 5s (insuficiente
   para navegação de 30s). `runHumanAction()` renova `human_action_until`
   em loop durante TODA a execução e libera no `finally` (sucesso/erro/
   cancelamento). Prova em teste: com TTL 200ms e renovação a cada 50ms,
   uma ação de 500ms mantém a devolução RECUSADA em ambas as instâncias o
   tempo todo (ACTION_INFLIGHT) e o agente só recebe o controle após o fim
   da ação.
5. **SSRF além da navegação inicial:** nova interceptação CDP
   `Fetch.requestPaused` no adaptador (egressDecisionForUrl) — cobre
   redirecionamentos e requisições secundárias da página (failRequest
   BlockedByClient em redes privadas/loopback/metadata/esquemas perigosos).
   DNS rebinding segue mitigado POR REDE no worker (política de egress +
   DNS pinning) — documentado como garantia do worker, não do app.
6. **Fail-closed sem persistência:** em produção (`NODE_ENV=production`),
   `ResilientSessionStore` NÃO degrada mais para memória: sem
   `computer_sessions` ou com Neon inacessível, tudo que abriria navegador
   real recusa com `PersistenceUnavailableError` → rotas respondem 503
   `PERSISTENCE_UNAVAILABLE` (reserve garantido a NÃO criar navegador —
   testado). Fallback em memória vale apenas para testes/desenvolvimento.
7. **Cota à prova de interrupção:** `close()` e `sweepExpired()` agora
   contabilizam unidades de TEMPO DE PAREDE
   (`GREATEST(units_used, CEIL(EXTRACT(EPOCH FROM (now() - created_at))/30))`)
   — sessão interrompida/abandonada/crashada entra no ledger mensal antes de
   liberar o índice único. Testado: 90s abandonados → 3 unidades; reserva
   seguinte cai em QUOTA_EXHAUSTED com budget esgotado.
8. **Testes obrigatórios executados nesta rodada:** simulador Neon HTTP
   realista (casController, setHumanActionInflight/renewHumanAction,
   renewChannel, attachChannel com expiração real); reserva/takeover
   cross-instance em plano SQL único; fail-closed do Neon (tabela ausente +
   erro de rede) bloqueando sessão real; cota após encerramento inesperado;
   takeover durante navegação longa (lock renovável); redirects/privados/
   metadata/opacos no guard de egress. PENDENTES por falta de infra/token
   (NÃO marcados como validados): canal CDP REAL em worker persistente;
   mouse/teclado/screencast REAIS (integração Browserless com token);
   DNS rebinding REAL (exige resolvedor do worker).
