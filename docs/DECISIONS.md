# DECISIONS.md — Plutão

Registro de decisões arquiteturais e de produto.  
Formato: DATA | DECISÃO | CONTEXTO | STATUS

---

## 2026-09-17 — Mission Workspace V1 (OS de trabalho)

**Decisão:** O Plutão não é chat com botões. Ciclo oficial:

`conversa → descobrir intenção → alinhar caminho → executar de verdade → artefato + evidência`

**Mission Workspace V1**
- Plano estruturado em `missions.plan` (JSON versionado v1): steps + events + `aligned`
- Planejador **acima do input** do chat + View de execução (trilha real)
- **Gate de falha:** nenhum passo N+1 inicia sem o N em `PASSED`
- Loop obrigatório: `FAILED → INSPECTING → FIXING → TESTING → PASSED`
- Alinhamento (`aligned: true`) obrigatório antes de `RUNNING`
- API: `GET/PATCH /api/missions/:id/plan` (create_plan, align, transition, append_event)
- Chat system prompt orienta intent (chat | mission | project | config) e alinhamento

**Não incluso nesta fatia:** browser/desktop virtual, lixeira, e-mail → missão.

**Status:** ACEITA / EM IMPLEMENTAÇÃO (`feat/mission-workspace-v1`)

---

## 2026-09-07 — Identidade de Produto

**Decisão:** O nome oficial do sistema é **Plutão**.

**Contexto:**  
Nome escolhido pelo usuário após análise de alternativas (Aether, Orbit, Lumen, Axiom, Nexus).  
Plutão transmite autonomia, independência e peso científico/mítico, alinhado com a visão de um sistema operacional de IA mission-first, contínuo e com forte ênfase em evidência e recuperação.

**Tagline provisória:** “Seu sistema operacional autônomo de IA”

**Status:** ACEITA

---

## 2026-09-11 — Brand System (BRAND-001)

**Decisão:** Lockup + paleta **Grafite e Platina Esverdeada** + grade **24×24** + razão **φ 1.618**.

**Rationale:**  
- §3.4 núcleo intocável → losango central fixo `(12,9)(15,12)(12,15)(9,12)`  
- §11 subagents / φ → braços 8:5 e 5:3  
- §9 runtime assimetria → equilíbrio sem simetria espelhada  

**Tokens:** `#0B0D0C` base · `#182420` surface · `#2E5C4C` mid · `#5FA88C` selo · `#9CD9C2` núcleo · `#1F3D33` pinho · `#F5F3EE` papel  

**Fonte de verdade:** `docs/BRAND.md` · assets em `assets/brand/`  
**Substitui** indigo/cyan como accent de **marca** (status semânticos permanecem).

**Status:** DECIDED

---

## 2026-09-07 — Modelo de Negócio / Tenancy (V1)

**Decisão:** V1 é single-user / uso pessoal (ferramenta de trabalho do proprietário).  
O modelo de dados manterá a estrutura `ACCOUNT → Agents → Projects` preparada para multi-tenant futuro, sem complexidade desnecessária no momento.

**Status:** ACEITA

---

## 2026-09-07 — Design System Baseline

**Decisão:**  
- Visual profissional, sóbrio e leve.  
- Dark mode como padrão + Light mode desde o início.  
- Mobile-first PWA.  
- Cores de marca: ver BRAND-001 (Grafite / Platina Esverdeada).  
- Tipografia: Inter (UI) + mono para código/logs.  
- Ícones: Lucide (principal) + ícones oficiais de marcas terceiras.  
- Loaders: LDRS (uiball/ldrs) apenas onde houver espera real.  
- Densidade informacional alta, porém respirável. Missão atual + status + o que precisa do usuário sempre em destaque.

**Status:** ACEITA (detalhamento em `DESIGN_SYSTEM.md` + `BRAND.md`)

---

## 2026-09-07 — Stack Frontend / PWA

**Decisão:** Next.js (App Router) + TypeScript + Tailwind CSS.

**Razões:**  
- Excelente suporte a PWA.  
- Deploy nativo e de primeira classe no Vercel.  
- Controle fino sobre Service Worker para atualizações transparentes (sem precisar desinstalar/reinstalar o PWA).  
- Server Components + Server Actions reduzem necessidade de API separada no início (progressive complexity).  
- TypeScript end-to-end.

**PWA Update Strategy:** Service Worker com versionamento de cache + `skipWaiting` + `clients.claim` para que novas versões do Vercel sejam aplicadas automaticamente na próxima abertura/navegação.

**Status:** ACEITA

---

## 2026-09-07 — Autenticação

**Decisão:** Autenticação completa desde a Phase 1 (cadastro, login, recuperação de senha, alteração de senha, logout, sessões seguras, proteção de rotas).  
Social login fica como evolução posterior.

**Status:** ACEITA (implementação na Phase 1)

---

## 2026-09-07 — Banco de Dados

**Decisão:** PostgreSQL como banco principal (candidato forte: Neon por ser serverless e ter skill de suporte).  
pgvector será avaliado quando chegarmos na Knowledge Engine (Phase 6).  
Migrations versionadas desde o início.

**Status:** ACEITA (detalhes de hosting a serem confirmados na implementação)

---

## 2026-09-07 — Estrutura de Repositório

**Decisão:** Monorepo pragmático:

```
apps/
  web/          → Next.js PWA (cockpit)
packages/
  domain/       → tipos e entidades de domínio compartilhados
  ui/           → componentes e design tokens (quando fizer sentido)
  config/       → configs compartilhadas
services/       → reservado para extração futura de serviços (mission, agent, etc.)
docs/           → documentação viva
```

Começamos simples e extraímos conforme a complexidade justificar (princípio 3.8 Progressive complexity).

**Status:** ACEITA

---

## Decisões resolvidas no código

- **Autenticação:** Sessão própria com cookies HTTP-only e hash `scrypt` (`apps/web/src/lib/auth`). (**IMPLEMENTADA / VERIFICADA**)
- **Infrutrutura de Modelos:** Modelo em nuvem via Groq (`openai/gpt-oss-120b`) + Modelo local cliente via `@huggingface/transformers` (`packages/domain/src/runtime/providers`). (**IMPLEMENTADA / VERIFICADA**)
- **Execução Durável & Checkpoints:** Persistência de checkpoints em banco Neon PostgreSQL (`apps/web/src/lib/runtime/checkpoint.ts`). (**IMPLEMENTADA / VERIFICADA**)
- **PWA Service Worker:** Custom Service Worker nativo em `apps/web/public/sw.js` com cache e suporte offline. (**IMPLEMENTADO / VERIFICADO**)
- **Pending Intents & Reconciliação (Marco A+B):** Fila offline em IndexedDB, idempotência server-side atômica, reconciler online com backoff e recuperação de SYNCING órfão. (**IMPLEMENTADA / VERIFICADA** — 2026-09-16)

---

## 2026-09-16 — Pending Intents + Evolução de Schema

**Decisão:** Offline mission creation usa `PendingIntent` persistido em IndexedDB (isolamento por `userId`), com reconciliação automática ao voltar online. Idempotência no servidor garantida por constraint UNIQUE `(user_id, idempotency_key)` na tabela `missions`.

**Contexto:**  
Marco A+B mergeado em `main` (`4e0e2f39`). Runtime DDL em `ensure.ts` para colunas de `missions` foi rejeitado em auditoria; a evolução de schema deve ser versionada via Drizzle migrations.

**Detalhes técnicos:**
- Contrato: `packages/domain/src/intents/types.ts`
- Store: `apps/web/src/lib/offline/pendingIntentStore.ts` (IndexedDB `plutao_offline_db`)
- Reconciler: backoff exponencial (5s → 15s → 45s, teto 120s); SYNCING órfão após 60s → `FAILED_RETRYABLE`
- Migration: `packages/db/drizzle/0002_missions_idempotency_key.sql`
- `ensure.ts` permanece apenas para bootstrap da tabela `executions` (legado de deploy antes de migrate automático)

**Status:** ACEITA / IMPLEMENTADA

---

## 2026-09-16 — Política de migrations (confirmação)

**Decisão:** Alterações estruturais de PostgreSQL **não** são feitas em runtime (exceto o bootstrap legado de `executions` em `ensure.ts`). Toda evolução nova vai para `packages/db/drizzle/` com journal Drizzle e aplicação via `DATABASE_URL_UNPOOLED`.

**Status:** ACEITA

---

## Decisões em aberto / Evoluções futuras

- **Background Execution:** missão continua com PWA/aba completamente fechado (Service Worker / Background Sync ou worker externo)
- Adapter externo para workers em background (Inngest / BullMQ para execução assíncrona fora do processo Next.js)
- Lixeira + exclusão granular + recibo de exclusão (P0 privacidade)
- Computador / Browser virtual (View V3)
- E-mail → missão; agenda de missões
