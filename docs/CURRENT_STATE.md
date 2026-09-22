# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-23 (Correção do Bug Crítico de Sessão Guest e Leitura/Escrita Purificadas)

Este documento registra o estado observado no repositório e em produção.
Capacidade só é **VERIFICADA** with evidência de uso real (não só código no `main`).

---

## Matriz

| Área | Status | Evidência / observação |
|------|--------|------------------------|
| Navegação e auth (email/senha) | **VERIFICADO** | Smoke produção. |
| Modo Convidado (Guest Mode) | **VERIFICADO** | Botão `GuestButton.tsx` renderizado na Landing (`apps/web/src/app/page.tsx`), endpoint `POST /api/auth/guest`, limits 10 msgs/15 min + rate limit 3 sessões/IP/dia + `LimitModal`. Leitura purificada sem auto-criação em page views (`getAuthOrGuestUser` / `getGuestSessionByToken`); erros de DB falham explicitamente. |
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
| Billing Stripe live (checkout/webhook) | **PENDENTE** | Schema/planos prontos; cobrança real não fechada. |
| B2. Ações por conversa | **IMPLEMENTED** | Rename, pin, share, delete, move project; `/share/[token]`; migration 0008 no Neon **VERIFICADA**. |
| `/ajuda` + `/legal/*` | **IMPLEMENTED** | Conteúdo estático; bot de ajuda **pendente**. |
| Auditor workflow | **IMPLEMENTED** | `.github/workflows/auditor.yml`. |
| Migrations 0000–0010 no repo | **IMPLEMENTED** | Journal Drizzle atualizado com 0010_guest_mode.sql. |
| Migrations no Neon produção | **VERIFICADO** | 2026-09-21: tabelas 0000–0004/0006/0007/0008/0010 presentes; colunas 0002/0006/0008/0010 presentes (`idempotency_key`, `plan`, `preferred_model`, `is_pinned`, `share_token`, `is_guest`). **0005** (`chat_messages`) não se aplica — tabela não existe no schema atual (SQL opcional/futuro). |
| Smoke M5 formal (missão + tool + evidência) | **PARCIAL** | Tools no chat OK; trilha de missão ponta a ponta ainda a formalizar. |
| Durable execution (Inngest etc.) | **DESIGNED** | Fora do fechamento V1. |
| Identidade “Cockpit” | **PROVISÓRIA** | Revisar pós-estabilização. |
| PWA / APK lojas | **PLANEJADO** | Após V1 web estável. |

---

## O que o código já faz (sem inventar)

- Botão "Explorar como convidado" renderizado na Landing page (`apps/web/src/app/page.tsx`) abaixo de "Já tenho conta"
- Endpoint REST `POST /api/auth/guest` cria sessões de convidado e define cookie `plutao_guest_session`
- Limite de sessão de convidado (10 mensagens OU 15 minutos) + Rate limit (máximo 3 sessões por IP por dia)
- Estados de conector: `disconnected → authorizing → connected → reconnecting → error`
- Tokens cifrados (AES) em `connectors.access_token_enc`
- Runtime carrega catálogo + status real + capabilities no system prompt
- Tools só executam se o conector estiver **conectado**
- `resolveCloudModelConfig(id)` mapeia catálogo → `provider` + `apiModel` + `baseUrl` + env keys
- Default nuvem: `MODEL_PROVIDER=xai` → modelo `grok-4.6`
- Fila de mensagens, FollowUpChips, card de conector sugerido

---

## Checklist V1 (objetivo)

### Operação

- [x] Confirmar no Neon: migrations **0004–0010** (0005 skip deliberado)
- [ ] Vercel env modelos: `MODEL_PROVIDER`, `MODEL_API_KEY` ou `XAI_API_KEY`, opcional `MODEL_NAME=grok-4.6`, `MODEL_BASE_URL=https://api.x.ai/v1`
- [ ] Chaves opcionais por card: `GROQ_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`
- [ ] Smoke modelos: chat default + teste em Configurações → Modelos (só cards com chave)
- [ ] Smoke conectores: GitHub list repos + Vercel list projects + desconectar/reconectar (já feito em parte; revalidar após deploys)
- [ ] Smoke B2: pin conversa + gerar link `/share/[token]` (usa colunas 0008)

### Produto (próximo ciclo)

- [ ] Neon conector: token/OAuth + tool no chat (igual Wave A)
- [ ] Stripe conector + **checkout/webhook** de planos (billing live)
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
```

Guia conectores GitHub: **`docs/CONECTORES_M5.md`**.
