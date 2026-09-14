# 🚀 PLUTÃO — VISÃO COMPLETA DA PLATAFORMA
> *Personal Autonomous AI Operating System — mission-first cockpit.*
> 
> 📌 **DOCUMENTO DE VISÃO DE PRODUTO — não é inventário de código.**
> O que segue é a direção almejada do Plutão. Para o estado real e confirmado de implementação, consulte sempre:
> 📄 `docs/CURRENT_STATE.md` — fonte única de verdade do que está funcional.

---

## 📑 SUMÁRIO
1. [🎯 VISÃO GERAL](#-visão-geral)
2. [🧠 FILOSOFIA E PROPÓSITO](#-filosofia-e-propósito)
3. [🏗️ ARQUITETURA DO SISTEMA](#️-arquitetura-do-sistema)
4. [🔄 MODOS DE OPERAÇÃO](#-modos-de-operação)
5. [📲 FUNCIONALIDADES — STATUS POR ETAPA](#-funcionalidades--status-por-etapa)
6. [🛡️ SEGURANÇA E PRIVACIDADE](#️-segurança-e-privacidade)
7. [📊 FASES DE PRODUTO](#-fases-de-produto)
8. [🎨 IDENTIDADE E DESIGN](#-identidade-e-design)
9. [🔮 FUTURO E VISÃO DE LONGO PRAZO](#-futuro-e-visão-de-longo-prazo)

---

## 🎯 VISÃO GERAL

**Plutão** é um **Sistema Operacional de IA Autônomo Pessoal** — um ambiente onde a IA não é apenas uma ferramenta de chat, mas sim um **agente colaborador contínuo**, que vive com você, aprende com você e executa missões de forma autônoma, com ou sem conexão com a internet.

> *"Não pergunte — delegue."*

### Problema que resolve:
- ⏳ **Dependência de conexão**: IAs atuais só funcionam online, em servidores terceiros
- 🔒 **Falta de privacidade**: Seus dados e conversas saem do seu dispositivo
- 📶 **Custos recorrentes**: Cada mensagem gera custo — sem previsibilidade
- 🤖 **Dependência de API**: Se o provedor cai, sua IA para de funcionar
- 🧠 **Falta de continuidade**: Conversas reiniciam, contexto se perde

### Solução almejada:
- 🟡 **Modo Híbrido**: IA na nuvem + IA local no dispositivo — o melhor dos dois mundos *(implementado: Groq + Local/Transformers.js; expansão para 6+ provedores prevista)*
- ✅ **Offline-First**: Funciona sem internet — modelo rolando direto no navegador via WebGPU/CPU
- 🟡 **Persistência Contínua**: Checkpoints salvos — a IA lembra de tudo *(implementado no banco; execução com navegador fechada em verificação)*
- ✅ **Seus dados, suas regras**: Isolamento por usuário implementado; RLS nativo do Postgres em configuração
- ✅ **Sem custos recorrentes**: Modelo local = sem conta por mensagem

---

## 🧠 FILOSOFIA E PROPÓSITO

### Princípios Fundamentais:

| Princípio | Descrição |
|---|---|
| 🔹 **Autonomia** | A IA não espera ordens — ela propõe, planeja e executa |
| 🔹 **Continuidade** | O estado da IA nunca se perde — fecha e reabre, ela continua de onde parou *(checkpoint implementado; Service Worker para execução em background ⏳ planejado)* |
| 🔹 **Privacidade Primeiro** | Seus dados ficam no seu dispositivo por padrão |
| 🔹 **Independência** | Não depende de nenhum provedor externo para funcionar — tem modo local |
| 🔹 **Transparência** | Você sempre vê o que a IA está fazendo — nunca é uma caixa preta |
| 🔹 **Controle Total** | Você decide o que sai, o que entra, o que é compartilhado |

### O Plutão NÃO é:
- ❌ Não é um chatbot genérico
- ❌ Não é um assistente de comandos
- ❌ Não depende de API terceira para existir — tem modo local
- ❌ Não envia seus dados sem consentimento

### O Plutão É:
- ✅ Um **parceiro digital autônomo**
- ✅ Um **ambiente de missões contínuas**
- 🟡 Um **sistema que funciona com ou sem internet** — modo híbrido implementado, fallback automático verificado
- ✅ **Seu, completamente seu** — isolamento de dados por usuário

---

## 🏗️ ARQUITETURA DO SISTEMA

### Stack Tecnológica (confirmada no repositório):

```text
Frontend:   Next.js 15 (App Router) + PWA Shell
UI:         Tailwind CSS + Design Tokens (BRAND-001)
Backend:    TypeScript Monorepo (apps/web, packages/domain, packages/db)
Banco:      PostgreSQL (Neon — São Paulo) + Drizzle ORM
IA Local:   Transformers.js + WebGPU / CPU Fallback
Auth:       Sessão própria via API routes (/api/auth/*)
Deploy:     Vercel (Frontend) + Neon (Database)
```

### Estrutura de Dados:
- **Usuários** → autenticados, isolados por `userId`
- **Modelos de IA** → catálogo híbrido (cloud + local)
- **Checkpoints** → estado da IA salvo no banco de dados
- **Missões** → tarefas com persistência contínua
- **Provedores** → Groq (confirmado) + Local/Transformers.js (confirmado) + expansão para Gemini, Ollama, Cloudflare, OpenRouter, DeepSeek *(planejada)*

### Modo Híbrido — O Coração do Plutão:

```text
┌─────────────────────────────────────────────────────┐
│              SELEÇÃO AUTOMÁTICA DE MODELO           │
├──────────────┬──────────────────┬──────────────────┤
│   🌐 ONLINE  │   ⚡ AUTOMÁTICO  │   📴 OFFLINE     │
│  (Nuvem)     │  (Melhor opção)  │  (Dispositivo)   │
│ - Groq ✅    │ - Escolhe o mais │ - Transformers.js✅│
│ - 4+ em breve│   rápido/disponível│ - WebGPU → CPU ✅ │
│              │ - Fallback auto   │ - Sem conexão ✅ │
├──────────────┴──────────────────┴──────────────────┤
│  Se a internet cai → muda para local AUTOMATICAMENTE ✅│
│  Se volta → retorna para nuvem AUTOMATICAMENTE      │
└─────────────────────────────────────────────────────┘
```

---

## 🔄 MODOS DE OPERAÇÃO

### 1️⃣ Modo Online ✅
- IA roda em servidores de alta performance
- Respostas rápidas, modelos grandes
- Fallback automático se provedor falhar
- *(Groq confirmado; outros 4+ em implementação)*

### 2️⃣ Modo Offline ✅
- Modelo baixado roda **direto no navegador** do usuário
- Sem custo, sem latência, sem dados saindo do dispositivo
- WebGPU acelera — se não disponível, cai para CPU automaticamente
- *(Transformers.js + WebGPU implementado e verificado)*

### 3️⃣ Modo Automático (Recomendado ✅)
- O Plutão decide sozinho:
  - Tem internet? → usa nuvem (rápido)
  - Sem internet? → usa local (não para)
  - Internet volta? → sincroniza e retorna

### 🔁 Reconciliação e Continuidade 🟡
- Ações feitas offline ficam em fila de pendentes ⏳
- Ao reconectar → sincroniza automaticamente ⏳
- Nada se perde — tudo é persistido antes de executar ✅
- *(Reconciliação e fila de pendentes em desenvolvimento para Fase 3)*

---

## 📲 FUNCIONALIDADES — STATUS POR ETAPA

> 📌 **Legenda:** ✅ Disponível | 🟡 Parcial | ⏳ Planejado

### 🧠 Núcleo de IA
- ✅ Multi-provedor base (Groq + Local/Transformers.js) — 2 implementados
- ⏳ Expansão para 6+ provedores (Gemini, Ollama, Cloudflare, OpenRouter, DeepSeek)
- ✅ IA Local Offline — Transformers.js + WebGPU + CPU fallback
- ✅ Seleção Inteligente — Auto/Online/Offline
- ✅ Checkpoints Persistidos — salvos no banco de dados
- 🟡 Fallback em cadeia — funcional, expansão de provedores pendente

### 🎯 Sistema de Missões
- ✅ Criar e nomear missões
- ✅ Acompanhar progresso em tempo real
- ✅ Recuperar missões antigas (histórico)
- 🟡 Continuar de onde parou — checkpoint restaurado; fechamento total do navegador ⏳
- ⏳ Execução em background (Service Worker) — Fase 3

### ⚙️ Configurações e Controle
- 🟡 Escolher provedor de IA preferido — interface existente, 2 provedores disponíveis
- ✅ Definir modo padrão (Auto / Online / Offline)
- 🟡 Gerenciar modelos baixados localmente
- ⏳ Visualizar uso e estatísticas
- ⏳ Exportar/importar dados pessoais
- ⏳ Excluir conta e dados — Fase 3

### 🔐 Segurança e Dados
- ✅ Autenticação segura
- 🟡 Isolamento por `userId` implementado; RLS nativo do Postgres em configuração
- 🟡 Política de privacidade e termos — compromisso de produto; páginas/docs a consolidar
- 🟡 LGPD — princípios adotados; exclusão de conta e formalização documental em andamento
- ⏳ Criptografia de ponta a ponta — Fase 4+

---

## 🛡️ SEGURANÇA E PRIVACIDADE

> **Seus dados são SEUS. Sempre.**

| Regra | Detalhe | Status |
|---|---|---|
| 🔒 **Dados isolados** | Cada usuário tem acesso exclusivo aos próprios registros | ✅ por `userId`; RLS nativo 🟡 |
| 📥 **Local-first** | O padrão é processar no dispositivo — só envia se você escolher nuvem | ✅ |
| 🚫 **Sem rastreamento** | Nenhum analytics de terceiro por padrão | ✅ |
| ✅ **Consentimento explícito** | Nada é compartilhado sem confirmação | ✅ |
| ⏳ **Exclusão total** | Você pode apagar tudo a qualquer momento | ⏳ Fase 3 |
| 📄 **Termos e Privacidade** | Documentos completos e acessíveis | 🟡 a consolidar |

---

## 📊 FASES DE PRODUTO

> ⚠️ **IMPORTANTE:** Estas são as **fases de produto** (visão de funcionalidade). Não são as mesmas que as **fases de engenharia** definidas em `docs/PROJECT_SPECIFICATION.md`. Sempre consulte `docs/CURRENT_STATE.md` para o estado real de implementação.

| Fase de Produto | Status | Descrição |
|---|---|---|
| ✅ **Fase 1 — Fundação** | 100% ✅ | Estrutura base, autenticação, banco de dados, UI core |
| ✅ **Fase 2 — Núcleo Híbrido** | 100% ✅ | Multi-provedor base, IA local offline, checkpoints persistidos, WebGPU |
| 🟡 **Fase 3 — Continuidade** | 80% 🟡 | Reconciliação offline→online, fila de pendentes, Service Worker em background |
| 📐 **Fase 4 — Integrações** | 40% 📐 | Ferramentas conectadas, notificações, exportações, multi-dispositivo |
| ⏳ **Fase 5 — Plataforma Completa** | 0% ⏳ | Ecossistema de extensões, marketplace, comunidade, API pública |

---

## 🎨 IDENTIDADE E DESIGN

> 📌 **Alinhado com `docs/BRAND.md` — BRAND-001**

### Paleta Oficial:
| Elemento | Código | Nome |
|---|---|---|
| Fundo escuro | `#0B0D0C` | Preto Carvão (`--base`) |
| Fundo secundário | `#182420` | Verde Escuro (`--surface`) |
| Destaque / Marca | `#5FA88C` | Verde Platão (`--selo`) |
| Secundário / Acento | `#9CD9C2` | Verde Claro (`--nucleo`) |
| Texto / Contraste | `#F5F3EE` | Branco Marfim (`--papel`) |

### Filosofia de Interface:
- **Simplicidade acima de tudo** — menos botões, mais clareza
- **Estado visível** — você sempre sabe o que a IA está fazendo
- **Sem distrações** — foco na missão, não em elementos decorativos
- **Responsivo por padrão** — celular primeiro, em qualquer tamanho de tela
- **Dark-first** — alinhado com uso prolongado de IA, identidade de marca

---

## 🔮 FUTURO E VISÃO DE LONGO PRAZO

### Curto Prazo (Fase 3–4):
- 🟡 Reconciliação automática ao voltar online — em desenvolvimento
- ⏳ Execução em background — missões continuam com o navegador fechado
- ⏳ Notificações de progresso
- ⏳ Exportação de dados completa
- ⏳ Sincronização multi-dispositivo
- ⏳ Exclusão de conta com um clique

### Médio Prazo (Fase 4–5):
- ⏳ Sistema de plugins e extensões
- ⏳ Mais 4+ provedores de IA
- ⏳ Aplicativos desktop + mobile nativos
- ⏳ API pública para integrações

### Visão Final:
> O Plutão se torna um **padrão aberto de IA pessoal** — onde cada pessoa possui, controla e executa sua própria IA, sem depender de grandes corporações, sem custos recorrentes, sem perder privacidade.
>
> *Autonomia digital para todos.* 🌍✨

---

---
📄 **VISÃO DE PRODUTO — não é garantia de funcionalidade imediata.**
> Fonte de verdade do que está implementado: `docs/CURRENT_STATE.md`  
> Especificação técnica de engenharia: `docs/PROJECT_SPECIFICATION.md`  
> Identidade visual oficial: `docs/BRAND.md`  
> 
> *Plutão — Personal Autonomous AI Operating System*  
> *Versão: 2.0 · Atualizado: 14/09/2026*
