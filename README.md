# Plutão OS

![Plutão OS](assets/brand/lockups/lockup_escuro_github.svg)

**Plutão é um cockpit pessoal para executar missões com estado persistente, ferramentas controladas e operação híbrida online/offline.** O projeto organiza uma intenção em uma missão acompanhável, executa etapas por meio de um runtime de agentes e mantém o histórico necessário para inspeção e retomada.

> **Estado do projeto:** base funcional em evolução. O núcleo de missões, runtime, ferramentas locais, modelos híbridos, autenticação e o primeiro ciclo de conectores estão implementados. A Browser Capability, o Tool Broker dedicado e os mecanismos próprios de permissão, aprovação e evidência ainda fazem parte do trabalho futuro.

**Produção:** [plutao-os.vercel.app](https://plutao-os.vercel.app)
**Repositório:** [github.com/jadiel054/plutao-os](https://github.com/jadiel054/plutao-os)

---

## O que o Plutão resolve

Aplicações de conversa são boas para trocar mensagens, mas não oferecem por si só uma unidade de trabalho durável. O Plutão usa a **missão** como unidade principal: uma tarefa tem identidade, estado, etapas, execução, sinais de progresso e critérios de conclusão.

O cockpit web permite criar e acompanhar missões, consultar o histórico, interromper execuções e observar o resultado do runtime. A arquitetura foi desenhada para evoluir de um cockpit pessoal para uma plataforma de autonomia controlada, sem apresentar a visão futura como funcionalidade pronta.

## O que existe hoje

| Área | Estado atual |
| --- | --- |
| Cockpit PWA | Implementado, com interface responsiva para chat, missões e configurações. |
| Mission Workspace | Implementado: criação, acompanhamento, histórico, plano sugerido e interrupção de missão. |
| Runtime de agentes | Implementado para o fluxo atual de execução, checkpoints e etapas persistidas. |
| Ferramentas locais | Implementado: dispatcher atual e sandbox de filesystem com `list`, `read`, `write`, `mkdir` e `stat`, incluindo proteção contra traversal. |
| Verificação | Implementada no fluxo atual por meio de estados de missão, eventos e critérios de Definition of Done. Isso não corresponde ainda a uma Evidence Engine independente. |
| Modelos | Implementado o plano híbrido: provedor online configurado e inferência local com Transformers.js, WebGPU e fallback para CPU. |
| Operação offline | Implementada a fila local de intenções pendentes e a reconciliação online do fluxo atual. A execução contínua com o navegador totalmente fechado ainda não está pronta. |
| Autenticação e dados | Implementados login, registro, sessão e isolamento por `userId`; RLS nativo do Postgres ainda está em configuração. |
| Conectores | M1–M3 implementados para GitHub: domínio, schema, OAuth e painel. A ponte dos conectores para ferramentas do dispatcher e a missão de fumaça continuam pendentes. |

A matriz detalhada e atualizada está em [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md).

## O que ainda não está implementado

Para evitar ambiguidade, os itens abaixo não devem ser interpretados como capacidades disponíveis no produto atual:

- Browser Capability e qualquer backend de browser;
- Tool Broker dedicado;
- Permission Engine e Approval Engine como módulos próprios;
- Evidence Engine independente por classe de evidência;
- execução de missões depois que o navegador é completamente fechado;
- ponte operacional entre GitHub OAuth e ferramentas do dispatcher;
- exportação completa de dados, exclusão de conta e sincronização multi-dispositivo.

As especificações dessas capacidades pertencem à arquitetura e à visão de produto. Consulte [`docs/BROWSER_CAPABILITY.md`](docs/BROWSER_CAPABILITY.md) e [`docs/PLATAFORMA_VISAO.md`](docs/PLATAFORMA_VISAO.md) para distingui-las do estado implementado.

## Arquitetura em alto nível

```text
Usuário
  ↓
Cockpit PWA (Next.js)
  ↓
APIs de missões, tarefas, execuções e conectores
  ↓
Mission Workspace + estado persistido (PostgreSQL/Drizzle)
  ↓
Runtime de agentes + checkpoints
  ↓
Dispatcher atual de ferramentas
  ├─ Sandbox de filesystem
  └─ Nota e armazenamento do fluxo atual
  ↓
Plano de modelos
  ├─ Inferência online
  └─ Inferência local (WebGPU/CPU)
```

A arquitetura de browser, permissões, aprovações, evidências avançadas e integrações adicionais está documentada como evolução planejada; ela não é representada acima como se já estivesse disponível.

## Stack

- **Aplicação:** Next.js 15, React 19 e App Router;
- **Interface:** Tailwind CSS, PWA shell e design system dark-first;
- **Monorepo:** npm workspaces com `apps/web`, `packages/domain` e `packages/db`;
- **Persistência:** PostgreSQL/Neon com Drizzle ORM;
- **Modelos locais:** `@huggingface/transformers`, WebGPU com fallback para CPU;
- **Deploy de referência:** Vercel.

## Executar localmente

### Requisitos

- Node.js 20 ou superior;
- npm;
- um banco PostgreSQL/Neon para os fluxos que dependem de persistência.

```bash
git clone https://github.com/jadiel054/plutao-os.git
cd plutao-os
npm install
cp .env.example .env.local
npm run dev
```

A aplicação fica disponível em `http://localhost:3000`. O endpoint de saúde é:

```bash
curl -s http://localhost:3000/api/health
```

Para configuração de ambiente, migrações, build e cuidados com o banco de produção, consulte [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). Nunca publique `.env.local` nem execute migrações de baseline contra o banco de produção sem revisão explícita.

## Verificação

Os comandos principais do repositório são:

```bash
npm run typecheck
npm run lint
npm run build
```

Os testes unitários existentes estão distribuídos entre o registro de modelos, a fila de intenções pendentes e as ferramentas de filesystem. O protocolo e as evidências de verificação estão em [`docs/VERIFICATION.md`](docs/VERIFICATION.md) e [`docs/OFFLINE_TEST.md`](docs/OFFLINE_TEST.md).

> Em ambientes sem dependências instaladas, `typecheck`, `lint` e `build` precisam ser precedidos por `npm install`.

## Documentação

| Documento | Finalidade |
| --- | --- |
| [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) | Fonte de verdade do estado atual e dos marcos de conectores. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitetura operacional e interação entre componentes. |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Setup local, ambiente, migrações e comandos. |
| [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | Critérios e matriz de verificação. |
| [`docs/BROWSER_CAPABILITY.md`](docs/BROWSER_CAPABILITY.md) | Contrato e status da capacidade de browser, atualmente projetada. |
| [`docs/PROJECT_SPECIFICATION.md`](docs/PROJECT_SPECIFICATION.md) | Baseline arquitetural e especificação de longo alcance. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Registro de decisões técnicas. |
| [`docs/BRAND.md`](docs/BRAND.md) | Identidade visual e tokens de marca. |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Diretrizes de interface. |
| [`docs/PLATAFORMA_VISAO.md`](docs/PLATAFORMA_VISAO.md) | Visão de produto e evolução futura. |
| [Evidências de produção](docs/testes/2026-09-17-production-smoke/relatorio-production-smoke.md) · [screenshot](docs/testes/2026-09-17-production-smoke/captura-home.webp) | Roteiro, resultados e captura pública do smoke test funcional. |

## Princípios do projeto

O Plutão prioriza **estado explícito**, **execução acompanhável**, **controle sobre ferramentas**, **privacidade por padrão** e **evolução incremental**. A documentação diferencia deliberadamente implementação, verificação, desenvolvimento e visão futura para que o repositório continue confiável para quem o conhece pela primeira vez.

## Licença

Nenhuma licença foi adicionada ou escolhida neste trabalho. A definição de licença permanece uma decisão futura do projeto.
