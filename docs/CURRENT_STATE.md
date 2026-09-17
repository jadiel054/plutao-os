# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-17 — Rota priorizada até conectores MCP OAuth (GitHub)

## Fase

Runtime + Agent Loop + Filesystem + Cockpit + Autonomia V1.1 + DoD + Pending Intents → **VERIFIED**.
Background Execution V1 → **IMPLEMENTED**.
Smart Long-Input / Artifacts → **VERIFIED**.
Controles de dados (Privacidade) → **IMPLEMENTED**.
Mission Workspace V1 → **IMPLEMENTED**.
Tools → eventos da View (1.1) → **IMPLEMENTED**.
Kernel de papéis (domain) → **IMPLEMENTED**.
Auto suggestedPlan no chat (1.2) → **IMPLEMENTED**.

## Matriz

| Área | Status |
|------|--------|
| Durable Runtime & Checkpoints | **VERIFIED** |
| Agent Loop & Tool Dispatcher | **VERIFIED** |
| Model nuvem + local | **VERIFIED** |
| Evidence / DoD gate | **VERIFIED** |
| Filesystem Tool V1 + Note + Sandbox | **VERIFIED** |
| Pending Intents offline | **VERIFIED** |
| Background autonomous-run | **IMPLEMENTED** |
| Mission Workspace V1 + tools→View | **IMPLEMENTED** |
| Domain AgentRole (4 papéis) | **IMPLEMENTED** |
| Auto suggestedPlan (1.2) | **IMPLEMENTED** |
| Stop-mission / cancel runtime | **PENDENTE** (1.3 — pré-requisito curto) |
| Conectores MCP + OAuth (GitHub 1º) | **PENDENTE** — **prioridade de produto** |
| Painel de conectores (estados + capacidades) | **PENDENTE** |
| Tools MCP no dispatcher + View | **PENDENTE** |
| Páginas /ajuda e /legal/* originais | **DEFERIDO** (após pesquisa) |
| Lixeira + recibo | **DEFERIDO** |
| Computador / browser virtual | **DEFERIDO** (visão; não bloqueia MCP) |

## O que já dá para testar hoje (sem MCP)

- Cockpit + `▶ Executar` / autonomous-run
- Tools internas: filesystem, note, sandbox
- Trilha na Mission View (poll 2,5s + plan.events)
- Chat → plano sugerido → gravar na missão → alinhar

Isso já é execução real no kernel. MCP multiplica as ferramentas externas (GitHub e depois outras).

## Rota até a experiência que você quer (MCP ao vivo)

Objetivo de produto: conectar GitHub de verdade, ver estados de auth, listar capacidades, o Executor usar essas tools na missão e a View mostrar a trilha.

### Ordem executável (documentação alinhada à prioridade)

| # | Marco | Por quê | Estimativa relativa |
|---|--------|---------|---------------------|
| **1.3** | **Stop-mission / cancel no runtime** | Segurança: não deixar missão rodando sem freio antes de tools externas | Curto |
| **M1** | **Domain + schema de conectores** | `ConnectorStatus`, registro por usuário, tokens cifrados, migration Drizzle | Médio |
| **M2** | **OAuth GitHub completo** | Fluxo: desconectado → autorizando → conectado → reconectar → erro; callback; refresh; revogar | Médio–longo |
| **M3** | **UI painel de conectores** | Configurações: estado, URL/servidor, lista de tools, Conectar / Desconectar / Reconectar | Médio |
| **M4** | **Bridge MCP → dispatcher** | Tools do GitHub (e depois outros) entram no Executor; evidência + plan.events | Médio |
| **M5** | **Missão de fumaça end-to-end** | Ex.: “listar issues do meu repo” → plano → align → tools GitHub → View ao vivo | Curto (validação) |

**Depois disso (não bloqueiam a felicidade do teste MCP):** 2.1 background aba fechada, lixeira, legal/ajuda originais, browser virtual.

## Kernel de agentes (já no código)

- **Núcleo** — chat + intent  
- **Planejador** — plan + align  
- **Executor** — loop + dispatcher + tools  
- **Verificador** — DoD + failure gate  

MCP = ferramentas novas sob o **Executor**, com auth no painel de produto.

## Decisão de prioridade (2026-09-17)

Com base em `DECISIONS.md` (conectores pós-kernel estável) e no objetivo do dono do produto (teste real de tools/habilidades):

1. Kernel de missão está estável o bastante (Workspace + 1.1 + 1.2).
2. Único pré-requisito técnico curto antes de OAuth externo: **1.3 stop**.
3. Em seguida **MCP GitHub** (M1→M5) sobe na frente de lixeira, legal e PC virtual.

## Próximo passo imediato de engenharia

**1.3 Stop-mission** → em seguida **M1 domain/schema conectores**.
