# CONTINUITY_AND_MISSION_DELIVERY.md — Arquitetura de Continuidade de Missão e Mission Delivery

**Status:** DESIGNED
**Alinhado com:** `docs/PROJECT_SPECIFICATION.md` (e Partes 2 e 3), `docs/ARCHITECTURE.md`, `docs/CURRENT_STATE.md`, `docs/DECISIONS.md`, `docs/VERIFICATION.md`

> **Frase fundamental:**
> «A especificação define o comportamento-alvo; `CURRENT_STATE.md` define a realidade implementada; evidências determinam o status de verificação.»

---

## 🎯 1. PRINCÍPIO FUNDAMENTAL DA CONTINUIDADE DE MISSÃO

> **«A interface pode desaparecer. A missão continua.»**
> **«A conectividade pode desaparecer. A missão continua enquanto existirem capacidades suficientes.»**

Uma mesma missão **NÃO** se divide em missões diferentes quando:
- O PWA/navegador é fechado, recarregado ou o dispositivo do usuário reinicia.
- A conectividade de rede cai, varia de latência ou é restabelecida (transição Online $\leftrightarrow$ Offline).
- O modelo ou provedor de inteligência muda dinamicamente (ex.: Groq `gpt-oss-120b` $\rightarrow$ WebGPU Local $\rightarrow$ Groq).
- O runtime de execução muda ou um agente/subagente especialista diferente assume a execução de um passo.

A missão é a unidade primária e imutável de trabalho do Plutão. O Chat PWA é um **cockpit de observabilidade e intervenção**, não a fonte de verdade do estado de execução.

---

## 📐 2. VISÃO GERAL DA ARQUITETURA DE CONTINUIDADE

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  USER / PWA COCKPIT                             │
│                  (Interface volátil de observação e controle)                   │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ Async Events / SSE / Polling
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 AGENT GATEWAY                                   │
│                       (Roteamento, Autenticação, Scope)                         │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 MISSION ENGINE                                  │
│             Lifecycle: CREATED → PLANNING → EXECUTING → VERIFYING               │
│             State Store: Neon PostgreSQL (ou Local IndexedDB em PWA)            │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             DURABLE EXECUTION CORE                              │
│         (Adapter: Inngest / Background Worker / Local Event Loop)                │
│         ├── Checkpointing & Memoization                                         │
│         ├── Step Replay & Retries com Backoff                                   │
│         └── Event Waits & Idempotency Guard                                     │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                 ┌─────────────────────┴─────────────────────┐
                 ▼                                           ▼
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│       ONLINE MODEL ROUTER       │         │      OFFLINE LOCAL ROUTER       │
│  (Groq / Cloud OpenAI-compat)   │         │    (WebGPU / Transformers.js)   │
└────────────────┬────────────────┘         └────────────────┬────────────────┘
                 │                                           │
                 └─────────────────────┬─────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            TOOL BROKER & SANDBOX                                │
│       CHECK → RECONCILE → EXECUTE ONLY IF NECESSARY (Idempotent Dispatch)       │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      EVIDENCE ENGINE & VERIFICATION LOOP                        │
│        (Evidências Criptográficas, Trace Logs, Artefatos, DoD Check)             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ 3. MODELO DE ESTADO E PERSISTÊNCIA DURÁVEL

### 3.1 Identidade Imutável da Missão (`MissionId`)
Conforme definido no modelo de objetos (`packages/domain/src/index.ts` e `docs/PROJECT_SPECIFICATION.md` §4–§5), cada missão possui um identificador único universal (`MissionId`).

Todas as execuções, checkpoints, eventos de log, chamadas de ferramenta e evidências colhidas são vinculados estritamente ao `MissionId`. Nenhuma troca de contexto de runtime (ex.: fechamento de aba do PWA) altera ou redefine o `MissionId`.

### 3.2 Desacoplamento entre Chat UI e Event Log
- **Chat UI:** Renderização temporária das mensagens e progresso no cliente.
- **Mission Execution Log:** Trilha imutável mantida no backend/storage persistente contendo a sequência de `AgentStep` (ver `PROJECT_SPECIFICATION.md` §10).
- Se a UI for encerrada durante uma execução de 10 minutos, o runtime prossegue registrando passos no banco de dados e nos checkpoints do executor durável. Ao reabrir o PWA, o estado mais recente é sincronizado via `GET /api/missions/:id`.

### 3.3 Checkpointing e Memoização de Passos
A execução durável (candidato V1: Inngest Adapter, ver `PROJECT_SPECIFICATION.md` §8) utiliza **passos memoizados**:
- Cada `AgentStep` concluído com sucesso e com evidência gerada grava um **checkpoint**.
- Em caso de falha de infraestrutura, encerramento de processo ou timeout de servidor, a retomada da missão lê o último checkpoint e **não reexecuta passos já finalizados**.
- O replay é determinístico e seguro contra efeitos colaterais duplicados.

---

## 🌐 4. RUNTIME HÍBRIDO ONLINE/OFFLINE E HANDOVER DE PROVEDOR

### 4.1 Estrutura de Provedores de Modelo
O Plutão abstrai provedores de modelo via `ModelSelector` e `ModelRouter` (`packages/domain/src/runtime/modelSelector.ts` e `packages/domain/src/models/registry.ts`).

| Modo | Provedor Principal | Runtime / Engine | Requisitos de Hardware | Fallback Local |
| :--- | :--- | :--- | :--- | :--- |
| **ONLINE** | Groq (`openai/gpt-oss-120b`) | HTTP OpenAI-Compatible API | Conexão com internet + API Key | Handoff automático para Local se falhar |
| **OFFLINE** | WebGPU Local (`huggingface/local`) | `@huggingface/transformers` | Navegador com suporte a WebGPU + Cache IndexedDB | Notificação de limitação de capacidade se sem modelo |

### 4.2 Protocolo de Handoff Sem Costura (Seamless Handover)
Quando ocorre oscilação de conectividade ou degradação de provedor:
1. **Detecção de Offline/Degradação:**
   - O `ModelSelector` detecta perda de ping para o endpoint da nuvem (`checkOnlineStatus()`) ou erro de rede do provedor Groq.
2. **Preservação de Contexto (Context Preservation):**
   - O runtime empacota o estado atual da missão, o plano e os últimos passos concluídos sem alterar o `MissionId`.
3. **Seleção de Provedor de Incongruência Zero:**
   - O selector transiciona para `ModelMode = 'offline'`, instanciando o `LocalProvider`.
4. **Execução de Capacidade Reduzida / Degradação Graciosa:**
   - O modelo local assume a execução de tarefas que estejam dentro do seu orçamento de contexto e capacidade de raciocínio (ex.: resumos, edição local de arquivos, tarefas sem dependência de raciocínio ultra-complexo).
5. **Reconciliação e Retorno Online:**
   - Assim que a conectividade é restabelecida, o `ModelSelector` pode alternar de volta para o modelo em nuvem (`online`), preservando toda a trilha de passos executados offline.

---

## 🔄 5. RECONCILIAÇÃO DE ESTADO E IDEMPOTÊNCIA

### 5.1 O Padrão CHECK $\rightarrow$ RECONCILE $\rightarrow$ EXECUTE
Para garantir que a reinicialização de um runtime ou a retentativa de uma tarefa não gere efeitos colaterais indesejados (como duplicar escrita em arquivos ou execuções repetidas de comandos), todas as ferramentas executadas via `Tool Broker` (`PROJECT_SPECIFICATION.md` §43 e §52) obedecem ao padrão:

```text
   ┌───────────────────────┐
   │    1. CHECK STATE     │  (Verifica estado atual do recurso/sistema)
   └───────────┬───────────┘
               │
               ▼
   ┌───────────────────────┐
   │    2. RECONCILE       │  (Compara o estado atual com o objetivo esperado)
   └───────────┬───────────┘
               │
      Is action necessary?
      ├── NÃO ───────────────► [Retorna Resultado Existente / Skip]
      └── SIM
           │
           ▼
   ┌───────────────────────┐
   │ 3. EXECUTE NECESSARY  │  (Aplica apenas o delta necessário)
   └───────────────────────┘
```

### 5.2 Deduplicação de Efeitos Colaterais nas Ferramentas
No **Filesystem Tool V1** (`apps/web/src/lib/runtime/tools/filesystem.ts` e `docs/CURRENT_STATE.md`):
- Operações de escrita (`write`) verificam o conteúdo e a existência anterior.
- Operações de diretório (`mkdir`) validam se o caminho já existe antes de tentar a criação.
- Erros estruturados (ex.: `PATH_OUTSIDE_SANDBOX`, `FILE_TOO_LARGE`) impedem qualquer alteração parcial corrompida.

---

## 📜 6. ARCHITECTURE DE PROVENIÊNCIA E EVIDÊNCIAS

### 6.1 Trilha de Execução (Execution Trace)
Nenhuma conclusão de missão no Plutão pode ser aceita puramente por declaração de texto do LLM (`docs/PROJECT_SPECIFICATION.md` §53 e §54). Toda transição para `COMPLETED` exige a coleta e validação de **Evidências Independente**.

Cada ação gera um objeto estruturado de evidência (`Evidence`):

```json
{
  "id": "evi_8f3a9b2c-1234-4567-89ab-cdef01234567",
  "missionId": "163d1a28-7346-413e-af7b-14f838e6cdd4",
  "stepId": "step_filesystem_write_01",
  "type": "tool_result",
  "toolName": "filesystem",
  "input": {
    "action": "write",
    "payload": { "path": "notes/teste-groq.txt" }
  },
  "output": {
    "path": "notes/teste-groq.txt",
    "size": 7
  },
  "timestamp": "2026-09-14T10:15:30.000Z",
  "verifier": "deterministic_filesystem_stat"
}
```

### 6.2 O Loop de Verificação (Verification Loop)
A verificação de entregáveis possui três níveis estritos:
1. **Determinística (Deterministic):** Checagem de saídas de comandos, existência de arquivos, tamanho, códigos de retorno HTTP/CLI, status de testes (`npm test`).
2. **Semântica (Semantic):** Avaliação de conformidade do conteúdo gerado com os requisitos expressos na *Definition of Done* (DoD).
3. **Adversarial (Adversarial - opcional/avançado):** Validação por subagente verificador independente que tenta encontrar falhas ou quebras de contrato no artefato produzido.

---

## 📦 7. MISSION DELIVERY E DEFINITION OF DONE (DoD)

### 7.1 Definição de Entrega de Missão (Mission Delivery)
A entrega de uma missão (`Mission Delivery`) consiste no ciclo final em que o Plutão consolida todos os resultados, valida a *Definition of Done*, empacota os artefatos duráveis e apresenta o relatório final de evidências no cockpit.

```text
  [ Passos de Execução Concluídos ]
                 │
                 ▼
  ┌──────────────────────────────┐
  │  VERIFICATION ENGINE RUNS    │
  │  - Roda Testes Determinísticos│
  │  - Valida Hash de Arquivos    │
  │  - Verifica DoD Especificada │
  └──────────────┬───────────────┘
                 │
      Passou na Verificação?
      ├── NÃO ───────────────────► [ Transiciona para CORRECTING / BLOCKED ]
      └── SIM
           │
           ▼
  ┌──────────────────────────────┐
  │  ARTIFACT & EVIDENCE PACKAGE │
  │  - Persiste em `artifacts`   │
  │  - Registra Evidências Finais│
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │ MISSION STATUS → COMPLETED   │
  └──────────────────────────────┘
```

### 7.2 Separação entre Mensagens e Artefatos Reutilizáveis
Alinhado com a arquitetura de Context Layer do Plutão:
- **Mensagens (Communication):** Atualizações de status e conversa, voláteis ou compactadas durante a sumarização de contexto.
- **Artefatos (Artifacts):** Produções persistentes reutilizáveis (código, documentação, arquivos de configuração, relatórios) salvas na tabela `artifacts` ou no sistema de arquivos da sandbox.
- **Referências Compactas:** Entradas longas (>1500 caracteres) recebem IDs de artefato (`artifactIds`) para manter o contexto do prompt leve e focado no cumprimento da missão.

---

## 📊 8. MATRIZ DE IMPLEMENTAÇÃO (DESIGNED vs IMPLEMENTED vs VERIFIED)

A tabela abaixo mapeia a situação atual das capacidades de continuidade e entrega de missão no repositório, em conformidade estrita com o `docs/CURRENT_STATE.md` e a arquitetura alvo.

| Módulo / Capacidade | Status no Repositório | Localização no Código / Evidência | Observações |
| :--- | :--- | :--- | :--- |
| **Identidade de Missão (`MissionId`)** | **VERIFIED** | `packages/domain/src/index.ts`, `packages/db/src/schema.ts` | Tabela `missions` e tipos de domínio integrados. |
| **Agent Loop V1 (Model $\rightarrow$ Tool $\rightarrow$ Result)** | **VERIFIED** | `packages/domain/src/runtime/agentLoop.ts`, `apps/web/src/lib/runtime/` | Reinjeção automática e limite configurável de iterações. Prova em prod com Groq. |
| **Provedor Real Groq (`gpt-oss-120b`)** | **VERIFIED** | `apps/web/src/app/api/` | Integrado e verificado com chave real em produção (missão `163d1a28...`). |
| **Sandbox Filesystem Tool V1** | **VERIFIED** | `apps/web/src/lib/runtime/tools/filesystem.ts` | Suporta `list`, `read`, `write`, `mkdir`, `stat` com isolamento e segurança. |
| **Evidência de Execução (`GET /api/missions/:id/evidence`)** | **VERIFIED** | `apps/web/src/app/api/missions/[id]/evidence/route.ts` | Rota ativa registrando outputs de ferramentas e checkpoints. |
| **Roteador Híbrido Online/Offline (`ModelSelector`)** | **IMPLEMENTED** | `packages/domain/src/runtime/modelSelector.ts` | Suporta alternância entre Groq e Local WebGPU (`transformers.js`). |
| **Durable Execution Adapter (Inngest / Replay)** | **DESIGNED** | `docs/ARCHITECTURE.md`, `docs/PROJECT_SPECIFICATION.md` §8 | Especificado conceitualmente atrás de interface genérica; a ser ativado em fase futura. |
| **Verificação Adversarial Automática** | **DESIGNED** | `docs/PROJECT_SPECIFICATION.md` §53 | Especificado na arquitetura de verificação; a ser expandido nas próximas fases. |

---

## 🔗 9. REFERÊNCIAS CRUZADAS E DOCUMENTAÇÃO RELACIONADA

Para obter detalhes complementares sem duplicação de especificações, consulte:
- **Especificação Mestre:** `docs/PROJECT_SPECIFICATION.md` (Seções 4, 5, 8, 10, 43, 52, 53, 54)
- **Visão Arquitetural:** `docs/ARCHITECTURE.md`
- **Realidade da Fase Atual:** `docs/CURRENT_STATE.md`
- **Decisões Registradas:** `docs/DECISIONS.md`
- **Critérios de Verificação e Testes:** `docs/VERIFICATION.md`
- **Guias de Execução e Deploy:** `docs/DEVELOPMENT.md` e `docs/DEPLOYMENT.md`
