# DECISIONS.md — Plutão

Registro de decisões arquiteturais e de produto.  
Formato: DATA | DECISÃO | CONTEXTO | STATUS

---

## 2026-09-17 — Voz do produto e originalidade (anti-genérico)

**Decisão:**

1. Nenhum texto de produto, legal, ajuda, Sobre, README público ou UI cita outras plataformas, produtos de IA de terceiros ou “criado por X”.
2. Só **Plutão** e os **agentes do Plutão**.
3. Análise de mercado fica em conversa técnica / decisões internas; **não** entra no sistema entregue.
4. Páginas `/ajuda` e `/legal/*` **não** usam template genérico. Na hora de criar: pesquisar práticas reais do domínio (LGPD, SO de trabalho, evidência, autonomia), filtrar o que se aplica ao modelo Plutão, redigir original.
5. Links no Sobre podem existir; conteúdo vazio ou genérico **não** é publicado.

**Status:** ACEITA

---

## 2026-09-17 — Kernel de agentes (plan-and-execute hierárquico)

**Decisão:** Plutão é SO de agentes desde a fundação. V1 não é swarm livre nem dezenas de personas.

**Modelo:** hierarquia **plan-and-execute**, rasa e auditável:

```
Usuário
   ↓
Núcleo              ← única voz com o usuário; intent
   ↓
Planejador          ← create_plan / align (Workspace)
   ↓
Executor(es)        ← tools; evidência; eventos na View
   ↓
Verificador         ← DoD + gate FAILED→INSPECTING→FIXING→TESTING→PASSED
```

**Regras:**
- Especialistas = tools com escopo sob o Núcleo e o plano (agente-como-tool), não malha solta.
- Papéis explícitos no kernel antes de “entrega plena”; não 10 bots na UI sem plano/evidência/stop.
- Estado, evidência, gate e trilha são o que separa produto de demo.

**Já no código (papéis implícitos → formalizar):**
- Núcleo: chat + intent
- Planejador: missions.plan + Workspace
- Executor: runtime + dispatcher + tools
- Verificador: evidência, DoD, failure gate
- Trilha: plan.events + poll 2,5s (1.1)

**Status:** ACEITA / EM FORMALIZAÇÃO

---

## 2026-09-17 — Conectores MCP (requisito executável, pós-kernel)

**Decisão:** Quando implementar conectores (GitHub primeiro), a superfície é de produto completo:

Estados: `desconectado → autorizando → conectado → reconectar → erro`

Exigências: OAuth/link real, fallbacks (token, escopo, rede, revogação), URL do servidor visível, inventário de capacidades/tools, desconectar que revoga de verdade, runtime só oferece o que o conector expõe.

**Não** é “conectado ✓” vazio. Entra depois do núcleo de missão estável.

**Status:** ACEITA / AGENDADA

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
- Tools → eventos na View (1.1): `planEvents` + poll 2,5s

**Não incluso nesta fatia:** browser/desktop virtual, lixeira, e-mail → missão.

**Status:** ACEITA / IMPLEMENTADA (main)

---

## 2026-09-07 — Identidade de Produto

**Decisão:** O nome oficial do sistema é **Plutão**.

**Contexto:**  
Nome escolhido pelo usuário após análise de alternativas.  
Plutão transmite autonomia, independência e peso científico/mítico, alinhado com a visão de um sistema operacional mission-first, contínuo e com forte ênfase em evidência e recuperação.

**Status:** ACEITA

---

## 2026-09-11 — Brand System (BRAND-001)

**Decisão:** Lockup + paleta **Grafite e Platina Esverdeada** + grade **24×24** + razão **φ 1.618**.

**Tokens:** `#0B0D0C` base · `#182420` surface · `#2E5C4C` mid · `#5FA88C` selo · `#9CD9C2` núcleo · `#1F3D33` pinho · `#F5F3EE` papel  

**Fonte de verdade:** `docs/BRAND.md` · assets em `assets/brand/`  

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
- Cores de marca: ver BRAND-001.  
- Tipografia: Inter (UI) + mono para código/logs.  
- Densidade informacional alta, porém respirável.

**Status:** ACEITA

---

## 2026-09-07 — Stack Frontend / PWA

**Decisão:** Next.js (App Router) + TypeScript + Tailwind CSS.  
PWA com Service Worker nativo, versionamento de cache, `skipWaiting` + `clients.claim`.

**Status:** ACEITA

---

## 2026-09-07 — Autenticação

**Decisão:** Autenticação completa desde o início (cadastro, login, logout, sessões seguras, proteção de rotas).  
Social login fica como evolução posterior.

**Status:** ACEITA

---

## 2026-09-07 — Banco de Dados

**Decisão:** PostgreSQL (Neon) + Drizzle. Migrations versionadas. Sem DDL estrutural em runtime (exceto bootstrap legado de `executions`).

**Status:** ACEITA

---

## 2026-09-07 — Estrutura de Repositório

**Decisão:** Monorepo pragmático (`apps/web`, `packages/domain`, `packages/db`, `docs`).

**Status:** ACEITA

---

## Decisões resolvidas no código

- **Autenticação:** Sessão própria cookies HTTP-only + `scrypt`. (**VERIFICADA**)
- **Modelos:** Nuvem + local WebGPU. (**VERIFICADA**)
- **Checkpoints:** Neon. (**VERIFICADA**)
- **PWA SW:** `apps/web/public/sw.js`. (**VERIFICADO**)
- **Pending Intents + reconciliação:** (**VERIFICADA** — 2026-09-16)
- **Mission Workspace V1 + tools→View (1.1):** (**IMPLEMENTADA** — 2026-09-17)

---

## 2026-09-16 — Pending Intents + Evolução de Schema

**Decisão:** Offline mission creation usa `PendingIntent` em IndexedDB; idempotência UNIQUE `(user_id, idempotency_key)`.

**Status:** ACEITA / IMPLEMENTADA

---

## 2026-09-16 — Política de migrations

**Decisão:** Evolução de schema só via `packages/db/drizzle/` + `DATABASE_URL_UNPOOLED`.

**Status:** ACEITA

---

## Decisões em aberto / Evoluções futuras

- Formalizar papéis de agente no domain (Núcleo, Planejador, Executor, Verificador) e 1.2 auto-plan
- 1.3 stop-mission no runtime
- Background Execution com aba fechada
- Conectores MCP (estados: desconectado → autorizando → conectado → reconectar → erro; capacidades listadas)
- Lixeira + recibo de exclusão
- Páginas `/ajuda` e `/legal/*` **somente** após pesquisa de domínio + redação original Plutão
- Computador / browser virtual
- E-mail → missão; agenda de missões
