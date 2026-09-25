# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-25 (voz on-device IMPLEMENTED — smoke pendente)

Este documento registra o estado observado no repositório e em produção.
Capacidade só é **VERIFICADA** with evidência de uso real (não só código no `main`).

---

## Matriz

| Área | Status | Evidência / observação |
|------|--------|------------------------|
| Navegação e auth (email/senha) | **VERIFICADO** | Smoke produção. |
| Modo Convidado (Guest Mode) | **VERIFICADO** (2026-09-25) | Landing + `POST /api/auth/guest` + limits. Fix auto-create PR #56. Smoke AC3/AC4: pill sobrevive a refresh; LimitModal e cadastro OK. |
| Guest → conta: transcript chat (BUG-03) | **TORNIQUETE client** | Causa raiz: transcript só em `localStorage` por e-mail (`plutao_chat_guest@plutao.ai` → e-mail real). Migração server só `missions`/`artifacts`. Torniquete: `migrateGuestChatLocalStorage` no register/login + Header. **Correção estrutural (persistência server de mensagens) agendada.** CR4: não deletar user guest na conversão (preserva `guest_sessions.converted_user_id`). |
| Write gate (GitHub write) | **VERIFICADO** (2026-09-25) | Smoke: `GATE_PENDING` → aprovação humana → repo público `plutao-smoke-gate` criado com README. **Ressalva:** feedback de execução no chat ainda pendente. |
| **Voz (Kokoro + Piper on-device)** | **IMPLEMENTED** | Engines: `kokoro-en` (kokoro-js@1.2.1, EN) + `piper-pt-br` (`pt_BR-faber-medium`, ~63MB CC0). Aba Configurações → Voz; MessageActions. Preferências `users.preferences` (migration **0015**, SQL manual Neon). **Smoke pendente** (AC1–AC5). pt-BR via Piper — pf_* comentados no kokoro-js 1.2.1. |
| B1. Login social (Google/GitHub) + Magic Link | **IMPLEMENTED** | Código + migrations 0007; smoke completo depende de `AUTH_*` + Resend em produção. |
| Mission Workspace + auto-plan + stop | **IMPLEMENTED / parcial VERIFICADO** | Plano, gate, CANCELLED. |
| Motion (sem confete) | **IMPLEMENTED** | DESIGN_SYSTEM. |
| Tools note / filesystem | **IMPLEMENTED** | Dispatcher + evidência. |
| Chat Núcleo + system prompt | **VERIFICADO** | Respostas reais em produção. |
| Chat — awareness de conectores | **VERIFICADO** | Status + capabilities no prompt; pergunta “quais conectores…” reflete GitHub/Vercel conectados. |
| Chat — tools GitHub | **VERIFICADO** | Lista de repositórios com OAuth real (`@jadiel054`). |
| Chat — tools Vercel | **VERIFICADO** | Lista de projetos com token/OAuth real. |
| Chat — FollowUpChips | **IMPLEMENTED** | Chips pós-tool; envio ao toque. |
| Chat — fila de mensagens | **IMPLEMENTED** | Até 3 msgs durante stream. |
| Chat — esclarecimento pré-tool | **IMPLEMENTED** | Validação de args + chips. |
| Card inline Conectar/Pular | **IMPLEMENTED** | `suggestedConnectors` + `ConnectorActionCard`. |
| Extrator de plano (anti falso-positivo) | **IMPLEMENTED** | Não trata inventário de conectores como missão. |
| Conectores UI (Sheet + Configurações) | **IMPLEMENTED** | Estados, gerenciar, catálogo. |
| GitHub OAuth App + callback | **VERIFICADO** | Fluxo completo em produção. |
| Vercel conector | **VERIFICADO** | Conectado e tools em chat. |
| Neon / Stripe (manifests declarativos) | **IMPLEMENTED** | Código Wave A/B; smoke OAuth/token **pendente**. |
| MCP personalizado (+) | **IMPLEMENTED** | Endpoints RFC 8414/9728 com `logo_uri` (`/icon.png`); favicon e app icon oficial 512x512 configurados. |
| Model resolve (`id → apiModel`) | **IMPLEMENTED** | `resolveConfig.ts`; default xAI `grok-4.6`; Gemini 3.1 corrigido. |
| Model test + fallback UI | **IMPLEMENTED** | `/api/model/test`; logs locais; depende de chaves por provedor. |
| Navigation `/planos` + founder pricing | **VERIFICADO** | R$19 / R$29 / R$39 por posição. |
| Billing Stripe (checkout/webhook) | **IMPLEMENTED** | 6/6 ACs verdes em modo **TEST** em 2026-09-25 (checkout, webhook, idempotência, cancelamento). Checkout hospedado + webhook com assinatura + idempotência `billing_events` (pre-check SELECT). Price IDs só via env. `users.plan` → `caronte` / `orbita_livre`. Migration 0012 (SQL manual Neon). **LIVE pendente** (ativação da conta Stripe pelo operador). **Não VERIFICADO em LIVE.** |
| B2. Ações por conversa | **IMPLEMENTED** | Rename, pin, share, delete, move project; `/share/[token]`; migration 0008 no Neon **VERIFICADA**. |
| `/ajuda` + `/legal/*` | **IMPLEMENTED** | Conteúdo estático; bot de ajuda **pendente**. |
| Auditor workflow | **IMPLEMENTED** | `.github/workflows/auditor.yml` (mantido; one-shots removidos). |
| Migrations 0000–0012 + **0015** no repo | **IMPLEMENTED** | 0012 stripe; **0015** `users.preferences` jsonb (SQL manual Neon). |
| Migrations no Neon produção | **VERIFICADO** (até 0010) | 2026-09-21: tabelas 0000–0004/0006/0007/0008/0010 presentes. **0011 write_gates, 0012 stripe_billing e 0015 user_preferences: aplicar SQL manual se ainda não rodado.** 0005 skip deliberado. |
| Smoke M5 formal (missão + tool + evidência) | **PARCIAL** | Tools no chat OK; trilha de missão ponta a ponta ainda a formalizar. |
| Durable execution (Inngest etc.) | **DESIGNED** | Fora do fechamento V1. |
| Identidade “Cockpit” | **PROVISÓRIA** | Revisar pós-estabilização. |
| PWA / APK lojas | **PLANEJADO** | Após V1 web estável. |

---

## O que o código já faz (sem inventar)

- Botão "Explorar como convidado" renderizado na Landing page (`apps/web/src/app/page.tsx`) abaixo de "Já tenho conta"
- Endpoint REST `POST /api/auth/guest` cria sessões de convidado e define cookie `plutao_guest_session`
- Limite de sessão de convidado (10 mensagens OU 15 minutos) + Rate limit (máximo 3 sessões por IP por dia)
- Pós-conversão guest→user: `handleGuestMigrationOnAuth` reatribui missions/artifacts; **não** apaga user guest (CR4); transcript chat migrado no client (`migrateGuestChatLocalStorage`)
- Estados de conector: `disconnected → authorizing → connected → reconnecting → error`
- Tokens cifrados (AES) em `connectors.access_token_enc`
- Runtime carrega catálogo + status real + capabilities no system prompt
- Tools só executam se o conector estiver **conectado**
- Write gate GitHub: aprovação humana via WriteGateCard antes de create/push
- `resolveCloudModelConfig(id)` mapeia catálogo → `provider` + `apiModel` + `baseUrl` + env keys
- Default nuvem: `MODEL_PROVIDER=xai` → modelo `grok-4.6`
- Fila de mensagens, FollowUpChips, card de conector sugerido
- Voz on-device: packs `kokoro-en` + `piper-pt-br`; API `/api/user/preferences`; aba Configurações → Voz
- Billing: `POST /api/billing/checkout` (requireUser, planSlug server-side) → Stripe Checkout Session; `POST /api/billing/webhook` (assinatura + idempotência pre-check); UI `/planos` com 3 CTAs fundador; `/planos/sucesso`

---

## Checklist V1 (objetivo)

### Operação

- [x] Confirmar no Neon: migrations **0004–0010** (0005 skip deliberado)
- [ ] Neon: aplicar **0011_write_gates** + **0012_stripe_billing** + **0015_user_preferences** (SQL Editor, manual) se ainda pendente
- [ ] Vercel env modelos: `MODEL_PROVIDER`, `MODEL_API_KEY` ou `XAI_API_KEY`, opcional `MODEL_NAME=grok-4.6`, `MODEL_BASE_URL=https://api.x.ai/v1`
- [ ] Vercel env Stripe LIVE (após ativação da conta): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FOUNDER19`, `STRIPE_PRICE_FOUNDER29`, `STRIPE_PRICE_FOUNDER39`
- [ ] Stripe Dashboard LIVE: Products founder + webhook endpoint `https://plutao-os.vercel.app/api/billing/webhook`
- [ ] Chaves opcionais por card: `GROQ_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`
- [ ] Smoke modelos: chat default + teste em Configurações → Modelos (só cards com chave)
- [ ] Smoke conectores: GitHub list repos + Vercel list projects + desconectar/reconectar (já feito em parte; revalidar após deploys)
- [ ] Smoke B2: pin conversa + gerar link `/share/[token]` (usa colunas 0008)
- [x] Smoke guest AC3/AC4 (pill + LimitModal/cadastro) — 2026-09-25
- [ ] Smoke BUG-03 AC1/AC2/AC3 (transcript guest→conta + guest_sessions preservada) após merge do torniquete
- [x] Smoke billing AC1–AC6 em **TEST** (2026-09-25)
- [ ] Smoke billing em **LIVE** após ativação Stripe
- [x] Smoke write gate (GATE_PENDING → aprovação → repo) — 2026-09-25; feedback no chat pendente
- [ ] Smoke voz AC1–AC5 (packs kokoro-en + piper-pt-br) em produção

### Produto (próximo ciclo)

- [ ] Persistência server de mensagens de chat + migração guest estrutural (substitui torniquete BUG-03)
- [ ] Neon conector: token/OAuth + tool no chat (igual Wave A)
- [ ] Stripe **conector** (manifest OAuth/token) — distinto do billing de planos
- [ ] Seletor AUTO / preferredModel: só ids com rota + chave; UI marca “sem chave”
- [ ] MCP personalizado: fluxo + estável e profissional
- [ ] Smoke missão formal: chat → plano → executar tool → evidência na trilha
- [ ] Central de ajuda: FAQ + bot (sem genérico)

### Explicitamente fora do V1

- Execução durable (Inngest / filas longas)
- APK / lojas de app
- Modelo próprio treinado
- Wave C completa (Linear, Notion, Sentry, …) — um a um depois

---

## Env de referência (produção)

```
# App
APP_URL=https://plutao-os.vercel.app

# Auth sessão + cifra de tokens de conector
SESSION_SECRET=
CONNECTOR_TOKEN_SECRET=   # ou SESSION_SECRET ≥16

# GitHub OAuth App (conector)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Modelo default (xAI)
MODEL_PROVIDER=xai
MODEL_API_KEY=            # ou XAI_API_KEY
MODEL_NAME=grok-4.6       # opcional
MODEL_BASE_URL=https://api.x.ai/v1

# Opcional por provedor do catálogo
GROQ_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=

# Auth social / magic link (B1)
AUTH_GOOGLE_CLIENT_ID=
AUTH_GOOGLE_CLIENT_SECRET=
AUTH_GITHUB_CLIENT_ID=
AUTH_GITHUB_CLIENT_SECRET=
# Resend / magic link conforme docs de auth

# Billing Stripe (checkout + webhook)
STRIPE_SECRET_KEY=sk_test_...   # ou sk_live_ após ativação
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_FOUNDER19=price_...
STRIPE_PRICE_FOUNDER29=price_...
STRIPE_PRICE_FOUNDER39=price_...
```

Guia conectores GitHub: **`docs/CONECTORES_M5.md`**.
