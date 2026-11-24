# Computador do Plutão — arquitetura

> Estado atual: plano de controle da sessão IMPLEMENTADO (no PR #203).
> Controle remoto real de Chromium: REQUER INFRA DEDICADA — especificado aqui,
> não implementado. Não apresentar como concluído até validar uma sessão real.

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
