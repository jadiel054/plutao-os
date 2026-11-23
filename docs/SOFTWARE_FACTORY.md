# Software Factory — Estado Real (2026-11-22)

Este documento descreve **o que está efetivamente implementado** na FASE 2. Nada aqui é
planejado descrito como pronto; o que falta está listado ao final.

## O que já funciona (com testes)

### Tool `process` — terminal real confinado

`apps/web/src/lib/runtime/tools/process.ts` — registrada como tool interna do Nix
(dispatcher, capability registry H9, perfil `software_engineer`, prompt do agente).

- **Spawn sem shell** (`spawn(cmd, args, { shell: false })`): input é JSON estruturado
  (`{"cmd":"npm","args":["test"],"cwd":"app"}`), nunca uma linha de shell.
- **Allowlist de binários:** `node`, `npm`, `npx`, `git`, `ls`, `cat`, `echo`, `mkdir`,
  `touch`, `mv`, `cp`. Qualquer outro binário é recusado antes do spawn.
- **Denylist reforçada** (defesa em profundidade, mesmo com allowlist):
  `rm`, `rmdir`, `chmod`, `chown`, `sh`, `bash`, `zsh`, `fish`, `curl`, `wget`, `ssh`,
  `sudo`, `kill`, `pkill`.
- **Metacaracteres de shell recusados:** `; & | ` $ \` \` no comando ou argumentos —
  impossibilita encadeamento/injeção mesmo dentro da allowlist.
- **Timeout obrigatório:** default 30 s, configurável até 120 s (`MAX_TIMEOUT_MS`);
  kill de grupo POSIX (`SIGTERM` → `SIGKILL` após 2 s) para não deixar netos órfãos.
- **Teto de saída:** 64 KB por stream (`MAX_OUTPUT_BYTES`), mais que isso é truncado e
  sinalizado (`truncated: true`).
- **Recurso limitado:** `stdio: ["ignore","pipe","pipe"]` — o processo não lê stdin
  (não interativo por construção).
- **Ambiente limpo:** o filho recebe apenas `PATH`, `HOME` (apontando para o workspace) e
  `LANG`. Nenhuma variável do servidor — secrets, connection strings, tokens — é
  propagada. Testado (`buildChildEnv` não contém `process.env` além de `PATH`).

### Gating e isolamento

- **Fail-closed duplo:** exige `SOFTWARE_FACTORY_PROCESS_ENABLED=1` **e** storage backend
  `LocalFilesystemStorage`. Sem a flag, ou com backend in-memory, toda chamada é recusada.
- **Workspace compartilhado com a tool `filesystem`:** o mesmo diretório
  (`<FILESYSTEM_STORAGE_LOCAL_PATH>/exec/userId__executionId`) servido pelo método público
  `workspaceRoot(executionId)` do `LocalFilesystemStorage`. Arquivos escritos pela tool
  `filesystem` são visíveis/alteráveis pela tool `process` (testado) e vice-versa.
- **Namespace por `userId__executionId`** (padrão H8, validado por UUID regex): um
  workspace por execução; execuções não compartilham diretórios.
- **cwd confinada:** `cwd` relativa é resolvida e verificada contra escape
  (realpath + prefix check); `cwd` fora do workspace é recusada.

### Capability registry (H9)

`INTERNAL_TOOL_CONTROLS["process"]` em `apps/web/src/lib/capabilities/registry.ts` com
controles `capability_allowlist`, `input_sanitization`, `output_sanitization`,
`sandbox_isolation`, `path_validation`, `audit_trail`. A tool só roda se o registro
aprová-la e se o perfil do especialista autorizou (`tool:process`).

## Evidências verificáveis

- `apps/web/src/lib/runtime/tools/__tests__/process.test.ts` — 11 testes, todos passando
  localmente: gating default-off, allowlist/denylist, metacaractere, parse de input,
  ambiente sem secrets, `node --version` real, `cat` de arquivo escrito pela tool
  `filesystem` (workspace compartilhado), escape de cwd recusado, timeout mata o
  processo, truncamento de saída.
- `docs/CAPABILITIES.md` regenerado via `npm run docs:capabilities` (tool `process` listada).
- Suíte completa: 639 testes em 113 arquivos passando; `npm run typecheck`, `npm run lint`
  e `npm run build` limpos nesta branch.

## Auditoria FASE 2 (2026-11-22, pós-prova em produção)

Prova real em produção (Cockpit): `execution COMPLETED`, `runtime_job SUCCEEDED`, DoD `PASSED`, 6 evidências, Write Gate aprovado com retomada.

### Achados e correções desta auditoria

1. **TASKS=0 no Cockpit (estrutural, corrigido):** o runtime do grafo v2 nunca populava a tabela `tasks` (só criação manual via API). Corrigido com a migration **aditiva** 0030 (`tasks.graph_node_id` + índice único parcial via `NULLS DISTINCT` — tasks manuais não são tocadas) e a projeção idempotente `graphTasks.ts` (uma task por nó, status sincronizado `RUNNING`→`COMPLETED` pelo scheduler serial, sempre best-effort: falha de projeção nunca trava a missão).
2. **Grafo com 1 item (por design, documentado):** `missionObjectiveToGraphV2` cria grafo unitário no intake (docs/MISSION_GRAPH_V2.md). As 6 evidências eram tool calls do dispatcher dentro do nó único. Planejamento automático multi-nó por modelo permanece pendente (FASE 4 — Especialistas).
3. **Shell injection hardening (corrigido):** metacaractere `|` foi adicionado ao recusador de argumentos da tool `process` (teste novo). Parênteses/newlines continuam aceitos por serem literais com `shell:false` (necessários para `node -e`.

### Escopo real do fluxo Software Factory hoje

| Etapa | Estado |
| --- | --- |
| Recebimento (intake/idempotência) | Real, testado, em produção |
| Planejamento (grafo v2) | Grafo unitário + grafo via plano alinhado no chat; planejador automático multi-nó pendente |
| Execução (worker serial durável) | Real, provado local + produção (I-01) |
| Evidências/Checkpoints/Write Gate | Reais (dispatcher + gates + checkpoint); status por nó agora também projetado em tasks |
| Terminal (tool `process`) | Real, confinado, fail-closed duplo; execução de builds/installs válida em ambiente com storage local |
| Entrega (artefatos/preview) | Parcial — exports existem; preview/servidor longo pendente (requer infra dedicada) |

## Limitação de segurança (explícita)

O confinamento atual é **workspace + allowlist + timeout**, **não isolamento de sistema
operacional**. Um binário da allowlist com comportamento arbitrário (ex.: `npm` executando
`postinstall`) roda no mesmo host que a aplicação, sem cotas de CPU/memória/rede.
Mitigações existentes reduzem o risco mas não o eliminam; para execução de código
não-confiável a nível de produção, a FASE 2 plena requer **container/VM dedicado**
(ex. Firecracker, gVisor ou container efêmero) fora do runtime serverless da Vercel.

## O que falta para a FASE 2 plena (pendente, documentado no PR #199)

- Tool `git` dedicada (status/commit/branch com validação semântica) — hoje `git` é
  invocável via `process`, dentro das mesmas restrições.
- Gestão de dependências com cache e telemetria (npm install é possível, mas sem cache
  de artefatos entre execuções).
- Servidores de longa duração e preview URLs — **fora do escopo serverless**: requere
  infraestrutura dedicada (container + proxy de preview), não implementado.
- Isolamento de SO real (container/VM) — ver limitação acima.
- Browser Engine (FASE 3) e Especialistas com delegação real (FASE 4).
