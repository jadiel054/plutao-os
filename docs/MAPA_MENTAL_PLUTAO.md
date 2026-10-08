# MAPA MENTAL — Plutão OS

**Documento-mestre para novos chats e onboarding de agentes.**  
**Atualizado:** 2026-09-28  
**Repo:** `jadiel054/plutao-os` · **Prod:** `https://plutao-os.vercel.app`  
**Estado operacional detalhado:** `docs/CURRENT_STATE.md` · **MCP:** `docs/MCP_SERVER.md`

> Capacidade só é **VERIFICADA** com evidência real em produção. Código no `main` = IMPLEMENTED, não necessariamente VERIFICADO.

---

## 1. O que é o Plutão

```
Plutão
├── Produto de negócio (assinaturas / founder pricing)
├── Agente de execução (chat + missões + tools)
├── Plataforma de conectores (OAuth/MCP → GitHub, Vercel, …)
├── Não hospeda o app do cliente: cria em terceiros
│     GitHub (código) · Vercel (frontend) · Neon/Render (backend) · Stripe (pagamento)
├── Web instalável (PWA) → depois APK/lojas
└── Meta longa: modelos próprios + infra própria
```

**Não é um chat genérico.**
**Não deve ser genérico** (textos, legal, ajuda, branding).  
**Não mencionar** outras IAs em docs/UI do produto — só Plutão e seus agentes.

**Identidade “Cockpit”:** provisória. Revisar pós-V1 estável; o produto é Plutão.

**Fundador / operador:** Jadiel (`@jadiel054`).

---

## 2. Princípios (não negociáveis)

1. **Segurança em todas as rotas** — tokens cifrados, OAuth correto, sem secret em URL/query.
2. **Originalidade** — nada genérico de template SaaS.
3. **Conectores oficiais** — OAuth/MCP real; estados claros; modelo sabe o que está conectado.
4. **Credenciais sensíveis** — alertar / mascarar no chat; preferir conector oficial a colar API key.
5. **Execução com maturidade** — admitir falha, explicar, corrigir; personalidade “Plutão”.
6. **Sem confete / exagero emocional** na UI de marcos.
7. **Fases de produto** não poluem a home — conteúdo de fases em Sobre/docs.
8. **Proveniência de modelo** — superfícies externas (MCP system_status, evidence de missão) usam `plutao-primary`; não vazam provider/model de terceiros.

---

## 3. Arquitetura técnica (visão)

```
                    ┌─────────────────────────────────────┐
                    │         apps/web (Next.js 15)         │
                    │  Chat · Missões · Conectores · Auth  │
                    │  /api/chat · /api/mcp · /api/oauth   │
                    └───────────┬─────────────┬───────────┘
                                │             │
              ┌─────────────────┘             └─────────────────┐
              ▼                                                 ▼
     ┌─────────────────┐                              ┌─────────────────┐
     │  Neon Postgres  │                              │  Model providers │
     │  @plutao/db     │                              │  API compatível  │
     │  Drizzle        │                              │  MODEL_* env     │
     └─────────────────┘                              └─────────────────┘
              │
              ▼
     ┌─────────────────────────────────────────────────────────┐
     │ Conectores (tokens AES em connectors.access_token_enc) │
     │ GitHub ✓ · Vercel ✓ · Neon/Stripe (código) · MCP+      │
     └─────────────────────────────────────────────────────────┘
```

**Monorepo** — TypeScript **^5** alinhado (root + apps/web + packages).

```
plutao-os/
├── apps/web/          # Next.js PWA — UI + API routes
├── packages/db/       # Drizzle schema + migrations
├── packages/domain/   # Catálogo conectores, tipos compartilhados
└── docs/              # CURRENT_STATE, MCP_SERVER, este mapa, CONECTORES_M5…
```

**Deploy:** Vercel projeto `plutao-os` (`prj_YjTtopHG6my18cA0xaUSwni7Chfn`).

---

## 4. Domínios funcionais

### 4.1 Auth de usuários

```
Auth usuário
├── Email/senha          VERIFICADO
├── Google / GitHub      IMPLEMENTED (env AUTH_*)
├── Magic link (Resend)  IMPLEMENTED
├── Guest Mode           VERIFICADO (limits + auto-create fix PR #56)
└── Sessão cookie HttpOnly  plutao_session
```

### 4.2 Chat Núcleo

```
Chat
├── System prompt + personalidade Plutão
├── Awareness de conectores  VERIFICADO
├── Tools só se conector connected
├── FollowUpChips · fila · card Conectar/Pular
├── Anti falso-positivo de “plano de missão”
├── Persistência server (conversations/messages)  VERIFICADO via MCP write
└── Model resolve: id catálogo → provider + apiModel + baseUrl
```

### 4.3 Missões

```
Missões
├── Plano / gate / stop (CANCELLED)
├── Evidência na trilha — source model:plutao-primary (mascarado)
├── Pin + share token (/share/[token])
├── Rename, delete, move project + ownership 403
└── Smoke formal ponta a ponta ainda PARCIAL
```

### 4.4 Conectores

```
Estados: disconnected → authorizing → connected → reconnecting → error

Nativos
├── GitHub     OAuth App  VERIFICADO
├── Vercel     OAuth/token VERIFICADO
├── Neon       manifest IMPLEMENTED — smoke pendente
├── Stripe     manifest IMPLEMENTED — account via /v1/account; billing TEST 6/6
└── MCP custom (+)  fase 2 VERIFICADO

Operador: 4/4 connected (revalidar pós-deploy)
```

### 4.5 MCP Server (agentes externos → Plutão)

```
MCP Plutão (nível GitHub/Vercel)
├── Resource server     /api/mcp
├── Authorization AS    /api/oauth/authorize + /token
├── Consent UI          /oauth/consent (mcp:read + mcp:write)
├── PRM + AS metadata   well-known
├── PKCE S256 · refresh + rotação · revoke
├── Audit + rate limit 30/min
├── system_status.model = plutao-primary
└── Tools
      plutao_system_status (read)
      plutao_list_connectors (read)
      plutao_list_conversations (read)
      plutao_get_mission (read)
      plutao_send_message (write)
```

Detalhe operacional: **`docs/MCP_SERVER.md`**.

### 4.6 Voz on-device

```
Engines
├── kokoro-en (kokoro-js) — EN, float32 interruptível
├── piper-pt-br (pt_BR-faber-medium) — PT-BR
└── Supertonic — chunked Range, IDB partials O(1), resume

UX: sanitizeForSpeech, progress humanizado, pack-scoped errors, playback tick ~4/s
Smoke comportamental Poco C65 (2026-09-27): VERIFICADO parcial (M3/M5 pendentes)
```

### 4.7 Billing / produto comercial

```
/planos  founder  R$19 / R$29 / R$39  VERIFICADO UI
Stripe checkout/webhook  TEST 6/6 (2026-09-25) · LIVE pendente
```

### 4.8 Legal / ajuda

```
/ajuda · /legal/*   IMPLEMENTED (estático)
Bot de ajuda + FAQ qualificado  PENDENTE
```

---

## 5. Banco (Neon)

**Migrations repo:** 0000–0012 + 0015 preferences + 0016 conversations/messages.  
**Neon prod:** 0000–0010 VERIFICADO; 0016 operacional (chat/MCP). Confirmar 0011/0012/0015 se SQL manual ainda pendente.

---

## 6. Roadmap mental

```
Ciclo A–F (voz + MCP write + polish)  FECHADO 2026-09-28

Próximas prioridades (recalcular com operador)
├── Feedback execução no chat do write-gate
├── Retry/resume Kokoro/Piper (partials generalizados)
├── Stripe LIVE
├── Neon conector smoke
├── Missão formal smoke
└── Central ajuda + bot

Fora de escopo imediato
├── Inngest / durable execution
├── APK / lojas
└── Modelo próprio
```

---

## 7. Como um agente novo deve trabalhar

1. Ler **este arquivo** + `docs/CURRENT_STATE.md` + `docs/MCP_SERVER.md` se o tema for MCP.
2. Não inventar status VERIFICADO sem evidência.
3. Não colocar token em URL; não logar secrets; não citar outras IAs no produto.
4. Preferir OAuth/conectores oficiais a colar key no chat.
5. Commits pequenos e funcionais; credenciais só no Vercel/Neon do operador.
6. UI: premium, estados de conector explícitos, sem poluição de “fases” na home.

---

## 8. Arquivos-âncora

| Doc | Uso |
|-----|-----|
| `docs/MAPA_MENTAL_PLUTAO.md` | **Este** — visão total e princípios |
| `docs/CURRENT_STATE.md` | Matriz VERIFICADO/IMPLEMENTED + checklist V1 |
| `docs/MCP_SERVER.md` | OAuth MCP, env, tools, segurança |
| `docs/CONECTORES_M5.md` | Guia conectores |
| `packages/db/drizzle/*` | Migrations |
| `packages/domain` | Catálogo de conectores |

---

*Manter este mapa alinhado a CURRENT_STATE quando fechar itens VERIFICADO. Em dúvida de status, CURRENT_STATE vence sobre memória de chat.*
