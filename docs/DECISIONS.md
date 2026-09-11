# DECISIONS.md — Plutão

Registro de decisões arquiteturais e de produto.  
Formato: DATA | DECISÃO | CONTEXTO | STATUS

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

## Decisões em aberto (a serem resolvidas com evidência)

- Provider de autenticação exato (Auth.js, better-auth, Lucia, ou custom)
- Runtime durable exato (Inngest continua como candidato forte atrás de adapter)
- Estratégia exata de Service Worker / PWA (manual já em uso; next-pwa/Serwist opcional)
