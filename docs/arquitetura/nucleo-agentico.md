# Núcleo agêntico — recuperação, aprendizado, descoberta, percepção, voz e assistência

Visão geral da evolução estrutural do núcleo agêntico do Plutão OS
(`apps/web/src/lib/agentic/`).

## Princípios

1. Fail-closed: toda execução passa pelo registro de capacidades existente
   (`lib/capabilities/registry.ts`). Aprender a usar uma ferramenta NÃO
   concede permissão.
2. Nada inventado: recuperação só usa alternativas autorizadas; sem caminho,
   escala para humano relatando exatamente o que falta.
3. Conhecimento ≠ regra permanente: experiências expiram e são checadas por
   compatibilidade (versão, ambiente, permissões).
4. Agnóstico de processo: descoberta de capacidades não acopla a PR/GitHub/
   Vercel; o Computador será apenas mais uma porta de execução.

## Módulos

| Módulo | Responsabilidade |
| --- | --- |
| `operational-knowledge.ts` | Tipos de conhecimento (confirmed/hypothesis/succeeded/failed), avaliação de aplicabilidade e ranking de alternativas. |
| `obstacle-recovery.ts` | Classificação de obstáculos, plano de recuperação autorizado, loop `runWithRecovery` com validação real de resultado e registro de experiência. |
| `tool-learning.ts` | Parse de documentação (contratos, auth, limitações), suficiência, probes autorizados somente-leitura com allowlist de host, montagem de conhecimento. |
| `experience-store.ts` | Persistência em `agent_experiences` com degradação graciosa (migration 0032 pendente ⇒ não quebra). |
| `capability-discovery.ts` | Inventário global (registro + aprendidas + flags + superfícies) e diff para estudo de capacidades novas/alteradas. |
| `app-surface.ts` | Registro semântico das páginas do próprio Plutão (rota, finalidade, controles). |
| `ui-perception.ts` | Leitura estruturada de páginas, localização de controles, planos de interação sem coordenadas, execução com verificação pós-ação e bloqueio de controles sensíveis sem confirmação humana. |
| `voice-assist.ts` | Mapeamento de comandos naturais (pt-BR) para intenções e planos; voz compartilha contexto da página e capacidades. |
| `guided-assist.ts` | Tutoriais/configuração guiada por objetivo + diagnóstico estrutural de páginas. |
| `agentic-view.ts` | Bloco de visão operacional injetado nos prompts. |

## Pontos de integração reais

- `lib/runtime/tools/dispatcher.ts`: em falha de tool, classifica o obstáculo,
  anexa plano de recuperação (`recovery`) ao resultado do dispatch e registra
  a experiência (best-effort). Vale para QUALQUER tool de missão.
- `lib/chat/buildPrompt.ts`: o fluxo de criação do Chat recebe a visão
  operacional (capacidades, superfícies, políticas) no system prompt.
- `app/api/agentic/assist/route.ts`: API de assistência (voz/contexto) que
  responde com descrições, explicações, planos de interação e tutoriais.
- `components/chat/NixVoiceAssist.tsx`: captura de voz (Web Speech API) e
  execução de interações autorizadas na própria interface, com verificação.

## Banco de dados

Migration preparada (`packages/db/drizzle/0032_agent_experiences.sql` + journal):
tabela `agent_experiences`. Aplicação no Neon é manual (mantenedor).
Sem a tabela, o store degrada graciosamente e o resto do núcleo funciona.

## Testes

Unitários: `lib/agentic/__tests__/*` (conhecimento, recuperação, aprendizado,
descoberta, percepção, voz, guiado). Integração (RUN_PG_TESTS):
`guardedTitleUpdate.pg.integration.test.ts` e
`experience-store.pg.integration.test.ts`.

## Sem validação nesta etapa (designado a testes complementares)

- Reconhecimento de voz real em navegadores (Web Speech API varia por browser).
- Probes contra APIs externas reais (dependem de credenciais/allowlist do usuário).
- Integração do plano de recuperação com execução real de missões multi-nó.
- Percepção visual (o Computador, quando retomado, implementará a porta
  `InteractionExecutor` para interfaces externas).


## Fase 2 — recuperação guiada por experiências, aprendizado, descoberta permanente e voz global

Delta sobre a Fase 1 (PR #208, mergeada). Princípios mantidos: aprendizado
NÃO concede autorização; persistência degrada graciosamente sem migrations;
nada é declarado validado sem execução real.

### Recuperação no dispatcher (guiada por experiências)

- Em falha de tool, o dispatcher consulta as experiências aplicáveis do
  usuário (findApplicableExperiences), reordena as alternativas AUTORIZADAS
  pela experiência real (rankForRecovery) e registra a experiência de falha.
- Retry único automático APENAS para obstáculos TRANSIENT (falha de
  conexão, request tipicamente não processado) e TIMEOUT — este último
  SOMENTE para tools registradas como idempotentes (IDEMPOTENT_TOOLS em
  dispatch-recovery.ts, lista estrita). TIMEOUT pode significar sucesso
  remoto: em tools não idempotentes a ação NÃO é repetida sem antes
  verificar o estado, e o resultado é reportado como incerto
  (TIMEOUT_UNCERTAIN_NOTE nos knownIssues). Sucesso no retry registra
  experiência positiva (successExperienceFor), fechando o ciclo.
- Quando a recuperação não resolve, o resultado do dispatch inclui
  "knownIssues": resumo do que já se sabe falho (summarizeKnownIssues),
  alimentando prompts e views. Sucesso após falha anterior da mesma tool
  também registra experiência positiva (fechamento do ciclo no fluxo normal).
- Integração pura em dispatch-recovery.ts (funções testáveis, sem I/O).

### Aprendizado de ferramentas (API)

- POST /api/agentic/knowledge: intake de documentação com redação de
  segredos (redactSecrets) ANTES de qualquer parse/persistência; probes GET
  apenas em hosts da allowlist do SERVIDOR (env PLUTAO_AGENTIC_PROBE_HOSTS).
  Segurança SSRF (knowledge-intake.ts): fetch com redirect MANUAL — cada
  destino de redirect é revalidado (allowlist + bloqueio de loopback,
  privado, link-local, metadata em IPv4/IPv6, incluindo ::ffff:), a
  resolução DNS é checada contra IP privado/local, com timeout e limite de
  tamanho da resposta; a evidência é redigida (redactSecrets) antes de
  persistir ou retornar. Conhecimento persistido como "tool-learning:<tool>"
  com estado hypothesis/confirmed conforme probe.
- GET /api/agentic/knowledge: lista o conhecimento aprendido.
- Aprender NÃO autoriza execução: permissões e gates existentes seguem
  intactos.

### Descoberta permanente de capacidades (API)

- GET /api/agentic/capabilities: inventário atual (registro estático +
  aprendidas + superfícies), diff contra o último snapshot e plano de estudo.
- POST /api/agentic/capabilities: salva snapshot versionado.
- LIMITAÇÃO DOCUMENTADA: a descoberta é MANUAL (gerada em GET, gravada em
  POST); NÃO há coleta contínua ou agendada nesta fase — o inventário não
  deve ser apresentado como continuamente atualizado (a API declara
  discoveryMode "manual").
- Limites e retenção: máximo MAX_SNAPSHOTS_PER_USER (20) snapshots por
  usuário e retenção de SNAPSHOT_RETENTION_DAYS (90) dias, com poda após
  cada gravação (snapshotsToPrune). Todas as leituras e a poda filtram por
  userId — nenhum usuário lê, modifica ou apaga snapshots de outro.
- Nova tabela agentic_capability_snapshots (migration 0033 — aplicada no
  Neon e verificada pelo mantenedor). Sem a tabela, a API responde com
  disponibilidade degradada; nada quebra.

### Percepção e interação ampliadas

- Resolução SEGURA do controle-alvo (resolveTargetControl): ao mencionar um
  controle, somente ele é alterado; controles ambíguos ou não identificáveis
  RECUSAM a ação e pedem esclarecimento — nunca múltiplos controles.
- planInteraction produz etapas de DIGITAÇÃO ("escreva/digite/preencha ...
  com \"texto\"") mirando o campo de entrada semântico; digitação SEM texto
  especificado é RECUSADA (nunca limpa o campo) e o texto informado é
  preservado exatamente (maiúsculas/minúsculas).
- Seleção de select com ação própria (type "select"): controle explícito +
  valor EXATO da opção (sem aproximação); opção inexistente ou divergente
  falha na verificação.
- Leitura de tela usa o TEXTO REAL recebido no snapshot (visibleText), não
  apenas seu tamanho nem uma finalidade estática.
- Páginas não registradas NUNCA são assumidas como Chat: a superfície é
  reportada como não identificada (pageIdForRoute + respostas neutras).
- Superfície /ajuda registrada (app-surface, rotas de percepção e navegação
  por voz).
- NixVoiceAssist: executor completo (click, toggle, digitação com setter
  nativo + evento input, seleção de opção com correspondência exata e
  navegação), snapshot com valores reais e VERIFICAÇÃO REAL pós-ação:
  o estado final do DOM é comparado com o esperado
  (verifyInteractionExpectations) e a confirmação do servidor é exigida —
  o sucesso ("Interação concluída e confirmada") só é anunciado quando o
  estado é confirmado; estado divergente, não verificável ou falha de
  verificação gera "Ação NÃO confirmada". Controles SENSÍVEIS exigem
  confirmação falada explícita (confirmo/cancela); nada executa sem isso.

### Voz global

- Novo layout do grupo (app): NixVoiceAssist renderiza em TODAS as páginas
  autenticadas (chat, cockpit, configurações, modelos, planos, artemis,
  ajuda). O componente saiu do Chat para não duplicar.

### Migrações e testes

- 0032_agent_experiences (Fase 1) e 0033_agentic_capability_snapshots
  (Fase 2) foram aplicadas no Neon e verificadas pelo mantenedor
  (27/11/2026). Nenhuma migration adicional foi criada nestas correções.
- Testes: unitários (dispatch-recovery, knowledge-intake,
  capability-snapshot, voice-assist, ui-perception) e de integração pg
  (capability-snapshot.pg.integration.test.ts, padrão dos demais: mock de
  @/lib/db, node-postgres, bootstrap idempotente, limpeza por ids).
