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

- 1 sessão simultânea por instalação: reserva atômica no `sessionManager`
  (seção síncrona do event-loop + marca `reserving` que fecha a janela de
  corrida do await).
- Autorização por usuário + conversa em TODA rota (ownership).
- Segredos apenas no servidor; `view()`/`connectionInfoFor()` não contêm
  token, host do provedor nem URL com credencial (testado).
- Exclusividade de controle por compare-and-set — o last-write-wins dos
  eventos do PR #203 é APENAS o acompanhamento observável, não a garantia.
- Lease/TTL: sessões abandonadas expiram (padrão 110s, teto do Free 2 min) e
  são encerradas; encerramento é verificado por todos os acesso.
- Cota: `PLUTAO_COMPUTER_MONTHLY_UNITS` (default 1.000) acumula unidades por
  encerramento/expiração; acima disso novas sessões são bloqueadas. Sem
  cobrança automática em nenhum caminho.
- Confirmação (window.confirm) para encerrar sessão; navegação restrita a
  http/https.

**Limitação honesta (cross-instance):** a exclusividade de UMA sessão por
instalação entre instâncias serverless distintas exige o registro durável
proposto (`computer_sessions`, INSERT condicional). Sem a migration, a
garantia forte é por instância — com o agravante de que o plano Free tem 1
navegador por vez de qualquer forma: a segunda conexão é recusada pelo
Browserless (429), que atua como salvaguarda real de concorrência.

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
| B | bloquear 2ª sessão simultânea | ✅ inclui janela de corrida (reserving) | sessionManager.test.ts |
| C | acesso negado a outra conversa/usuário | ✅ | sessionManager.test.ts |
| D | agente pausa no controle humano | ✅ no loop real do buildRunner (sessão remota mockada) | computerRealSession.test.ts |
| E | agente retoma após devolver | ✅ mesmo caminho | computerRealSession.test.ts |
| F | nenhum controle simultâneo | ✅ CAS | sessionManager.test.ts |
| G | desconexão/reconexão | ⚠️ lógica + contrato; rede real só no teste de integração | sessionManager + browserlessIntegration |
| H | cota gratuita esgota → bloqueia | ✅ | sessionManager.test.ts |
| I | nenhum segredo no frontend/logs/eventos | ✅ view/connectionInfo sem token/host (assertions sobre String serializada) | sessionManager.test.ts |
| J | trocar Browserless → self-hosted sem mudar o Chat | ✅ | sessionManager.test.ts |
| — | Chromium real E2E | ✅ teste de integração real (roda só com `BROWSERLESS_API_TOKEN`; pulado sem token — honesto sobre isso) | browserlessIntegration.test.ts |

Executado nesta sandbox: 89 testes passando (nenhum com token). A validação
real rede+Chromium fica explícita como pendência para execução com token.
