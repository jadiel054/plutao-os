# MAPA MENTAL — Plutão OS

**Documento-mestre para novos chats e onboarding de agentes.**  
**Atualizado:** 2026-09-21  
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

**Não é “mais um ChatGPT clone”.**  
**Não deve ser genérico** (textos, legal, ajuda, branding).  
**Não mencionar** outras IAs (Grok, ChatGPT, Jules…) em docs/UI do produto — só Plutão e seus agentes.

**Identidade “Cockpit”:** provisória (herança de conversas antigas). Revisar pós-V1 estável; o produto é Plutão, não um cockpit genérico.

**Fundador / operador:** Jadiel (`@jadiel054`).

---

## 2. Princípios (não negociáveis)

1. **Segurança em todas as rotas** — tokens cifrados, OAuth correto, sem secret em URL/query.
2. **Originalidade** — nada genérico de template SaaS.
3. **Conectores oficiais** — OAuth/MCP real; estados claros; modelo sabe o que está conectado.
4. **Credenciais sensíveis** — alertar / mascarar no chat; preferir conector oficial a colar API key.
5. **Execução com maturidade** — admitir falha, explicar, corrigir; personalidade “Plutão”.
6. **Sem confete / exagero emocional** na UI de marcos.
7. **Fases de produto** não poluem a home — conteúdo de fases em Sobre/docs, não banner “Phase 2”.

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
     │  @plutao/db     │                              │  OpenAI-compat   │
     │  Drizzle 0000–8 │                              │  MODEL_* env     │
     └─────────────────┘                              └─────────────────┘
              │
              ▼
     ┌─────────────────────────────────────────────────────────┐
     │ Conectores (tokens AES em connectors.access_token_enc) │
     │ GitHub OAuth ✓ · Vercel ✓ · Neon/Stripe (código) · MCP+ │
     └─────────────────────────────────────────────────────────┘
```

**Monorepo**

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
└── Sessão cookie HttpOnly  plutao_session
```

### 4.2 Chat Núcleo

```
Chat
├── System prompt + personalidade Plutão
├── Awareness de conectores (status + capabilities no prompt)  VERIFICADO
├── Tools só se conector connected
├── FollowUpChips (pós-tool)
├── Fila de mensagens (até 3 durante stream)
├── Card Conectar/Pular (suggestedConnectors)
├── Anti falso-positivo de “plano de missão”
├── UI premium (histórico, modelo, ações mensagem — em evolução)
└── Model resolve: id catálogo → provider + apiModel + baseUrl
```

**Modelos em produção (prático):** operador usa `MODEL_*` OpenAI-compatible (`gpt-4o` / mini).  
Código default catalog: xAI `grok-4.6` se provider xai.  
Gemini 3.1 entries corrigidas (não mais copy-paste 2.0-flash).

### 4.3 Missões

```
Missões
├── Plano / gate / stop (CANCELLED)
├── Evidência na trilha
├── Pin + share token (/share/[token])  migration 0008 VERIFICADA
├── Rename, delete, move project
└── Smoke formal ponta a ponta ainda PARCIAL
```

### 4.4 Conectores (dentro do produto)

```
Estados: disconnected → authorizing → connected → reconnecting → error

Nativos prioritários
├── GitHub     OAuth App  VERIFICADO (list repos no chat)
├── Vercel     OAuth/token VERIFICADO (list projects no chat)
├── Neon       manifest IMPLEMENTED — smoke pendente
├── Stripe     manifest IMPLEMENTED — billing live PENDENTE
└── MCP custom (+)  PARCIAL

Segurança conectores
├── access_token_enc (AES)
├── Escopos só o usuário autoriza
└── Modelo orienta conexão; não inventa tools offline
```

UI: aba Conectores em Configurações + acesso rápido (estilo Grok).  
Catálogo por objetivo (criação, deploy, dados…) — expandir sem hardcode por provedor no runtime.

### 4.5 MCP Server do Plutão (agentes externos → Plutão)

**Objetivo:** Claude, Cursor, Grok, etc. auditam/ajudam o Plutão com tools oficiais.

```
MCP Plutão (nível GitHub/Vercel)
├── Resource server     /api/mcp
├── Authorization AS    /api/oauth/authorize + /token
├── Consent UI          /oauth/consent
├── PRM RFC 9728        /.well-known/oauth-protected-resource
├── AS metadata 8414    /.well-known/oauth-authorization-server
├── PKCE S256 obrigatório
├── Access token ~1h, aud = URL do MCP, scope mcp:read
├── Ops key opcional    Bearer header only (PLUTAO_MCP_API_KEY)
├── PROIBIDO            token na query string
└── Tools read-only
      plutao_system_status
      plutao_list_connectors
      plutao_list_conversations
      plutao_get_mission
```

**Nunca expor** tokens de GitHub/Vercel/Neon via tools MCP.

Env MCP: `MCP_TOKEN_SECRET` (ou fallback SESSION/CONNECTOR secret), `APP_URL`, ops key opcional.

### 4.6 Billing / produto comercial

```
/planos  founder  R$19 / R$29 / R$39  VERIFICADO UI
Stripe checkout/webhook  PENDENTE
```

### 4.7 Legal / ajuda

```
/ajuda · /legal/*   IMPLEMENTED (estático)
Bot de ajuda + FAQ qualificado  PENDENTE (sem genérico)
```

---

## 5. Banco (Neon)

**Migrations repo:** 0000–0008 (Drizzle).  
**Neon prod (2026-09-21):** VERIFICADO — 0005 `chat_messages` **não aplica** (schema atual sem essa tabela).

Colunas críticas confirmadas: `missions.idempotency_key`, `is_pinned`, `share_token`; `users.plan`, `preferred_model`.

Tabelas presentes (amostra): users, sessions, missions, connectors, projects, tasks, artifacts, executions, agents, usage_counters, magic_link_tokens, …

---

## 6. Mapa de pastas críticas (apps/web)

```
src/app/
├── (app)/chat/          # UI chat
├── api/chat/            # runtime chat + tools
├── api/mcp/             # MCP resource server
├── api/oauth/           # authorize · token · consent POST
├── oauth/consent/       # UI consentimento
├── .well-known/         # PRM + AS metadata
├── api/connectors/      # OAuth por provider
└── api/auth/            # login social, magic link, …

src/lib/
├── mcp/                 # auth · tokens · tools
├── connectors/          # service · crypto · github/vercel OAuth
├── runtime/model/       # resolveConfig · config
└── auth/                # session · cookies · social
```

---

## 7. Env de produção (mapa)

```
APP_URL
SESSION_SECRET · CONNECTOR_TOKEN_SECRET
GITHUB_CLIENT_ID · GITHUB_CLIENT_SECRET          # conector GitHub
MODEL_PROVIDER · MODEL_API_KEY · MODEL_NAME · MODEL_BASE_URL
# opcional: GROQ_ · OPENAI_ · GEMINI_ · OPENROUTER_
AUTH_GOOGLE_* · AUTH_GITHUB_* · RESEND_API_KEY
DATABASE_URL
MCP_TOKEN_SECRET · PLUTAO_MCP_API_KEY · PLUTAO_MCP_USER_ID
MCP_OAUTH_REDIRECT_ALLOWLIST   # opcional
```

**Observação modelos:** em produção o operador relatou chat estável com **OpenAI-compatible / gpt-4o** via `MODEL_*` (não necessariamente xAI).

---

## 8. Roadmap mental

```
V1 fechar
├── Env modelo + smoke
├── Pin/share smoke
├── MCP OAuth smoke (PRM → consent → tools)
├── Neon conector smoke
├── Stripe billing live
└── Missão formal smoke

Depois V1
├── mcp:write + gate
├── Central ajuda + bot
├── MCP personalizado UX
├── Wave C conectores (um a um, doc oficial)
├── PWA/APK
├── Identidade visual/nome pós-“Cockpit”
└── Modelo próprio (longo prazo)

Fora de escopo imediato
├── Inngest / durable execution
└── Genéricos de marketing/legal
```

---

## 9. Como um agente novo deve trabalhar

1. Ler **este arquivo** + `docs/CURRENT_STATE.md` + `docs/MCP_SERVER.md` se o tema for MCP.
2. Não inventar status VERIFICADO sem evidência.
3. Não colocar token em URL; não logar secrets; não citar outras IAs no produto.
4. Preferir OAuth/conectores oficiais a colar key no chat.
5. Commits pequenos e funcionais; credenciais só no Vercel/Neon do operador.
6. UI: premium, estados de conector explícitos, sem poluição de “fases” na home.

---

## 10. Diagrama-resumo (uma página)

```
                         ┌──────────────┐
                         │   Usuário    │
                         └──────┬───────┘
                login/sessão    │    OAuth MCP (Claude/Cursor/Grok)
                                ▼
┌─────────────┐         ┌───────────────┐         ┌────────────────┐
│  Chat UI    │◄───────►│  Next.js API  │◄───────►│ MCP /api/mcp   │
│  Missões    │         │  /api/chat    │         │ resource server│
└──────┬──────┘         └───────┬───────┘         └────────┬───────┘
       │                        │                          │
       │               tools se connected                  │ Bearer
       │                        ▼                          │ OAuth token
       │               ┌────────────────┐                  │
       │               │ GitHub·Vercel  │                  │
       │               │ (+ Neon/Stripe)│                  │
       │               └────────┬───────┘                  │
       │                        │                          │
       └────────────────────────┼──────────────────────────┘
                                ▼
                        ┌───────────────┐
                        │ Neon + Models │
                        └───────────────┘
```

---

## 11. Arquivos-âncora

| Doc | Uso |
|-----|-----|
| `docs/MAPA_MENTAL_PLUTAO.md` | **Este** — visão total e princípios |
| `docs/CURRENT_STATE.md` | Matriz VERIFICADO/IMPLEMENTED + checklist V1 |
| `docs/MCP_SERVER.md` | OAuth MCP, env, tools, segurança |
| `docs/CONECTORES_M5.md` | Guia conectores (GitHub etc.) |
| `packages/db/drizzle/*` | Migrations |
| `packages/domain` | Catálogo de conectores |

---

*Manter este mapa alinhado a CURRENT_STATE quando fechar itens VERIFICADO. Em dúvida de status, CURRENT_STATE vence sobre memória de chat.*
