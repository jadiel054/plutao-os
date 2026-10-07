# Plutão OS — Laudo técnico geral

**Data:** 7 de outubro de 2026  
**Repositório:** `jadiel054/plutao-os`  
**Escopo:** agent loop, execução de missões, conectores, criação/deploy de projetos, qualidade de entrega, interface do chat e prioridades de evolução.

## 1. Resumo executivo

O Plutão OS já deixou de ser apenas uma interface de chat. O núcleo atual possui autenticação e isolamento de tenant, conectores com capabilities, write gates server-side, evidências, checkpoints, Definition of Done e um loop de agente com limites acumulados. Isso é uma base técnica séria e, especialmente na parte de segurança, está acima de muitos protótipos de agentes.

A conclusão importante é outra: **o sistema é funcional, mas ainda não deve ser descrito como um executor durável equivalente a Manus, Claude Computer Use ou uma plataforma de agentes de produção**. O loop executa dentro de uma requisição HTTP com teto de duração; portanto, missões longas, fechamento total do aplicativo, indisponibilidade do provedor ou concorrência de retomadas ainda exigem uma camada de worker/fila durável e observabilidade operacional mais forte.

Também foi corrigido nesta rodada o botão do composer: no repouso ele mostra a seta para cima e envia; durante processamento ele mostra o quadrado, interrompe o stream e solicita o cancelamento da missão ativa. O comportamento está coberto por teste direcionado, além de typecheck e lint.

## 2. O agent loop executa até o fim?

**Executa até atingir uma condição de parada, não até uma promessa textual do modelo.** A implementação em `apps/web/src/lib/runtime/agent-loop.ts` repete o ciclo modelo → tool → resultado → modelo e possui as seguintes proteções:

| Proteção | Estado observado |
|---|---|
| Limite por chamada | `MAX_ITERATIONS = 20` |
| Limite acumulado por execution | `MAX_TOTAL_ITERATIONS = 60`, salvo no checkpoint |
| Limite acumulado de tokens | `MAX_TOTAL_TOKENS = 120.000` tokens reportados |
| Limite de tempo da requisição | `MAX_LOOP_DURATION_MS = 240.000` ms |
| Repetição de tool | Assinatura de nome + input repetida encerra o ciclo |
| Ausência de progresso | Outputs idênticos repetidos encerram o ciclo |
| Execução interrompida | O status da execution é revalidado antes de cada iteração |
| Persistência do orçamento | Falha no checkpoint é fail-closed e tenta marcar a execution como `FAILED` |
| Escritas externas | GitHub, Vercel, Render e demais providers passam por write gate server-side |

Assim, o loop **não fica infinito e não continua gastando tokens indefinidamente**. Quando o modelo não propõe mais uma tool, repete uma operação, falha ou atinge orçamento, o runtime para e registra o motivo. Isso é correto do ponto de vista de segurança, mas significa que “parar sem erro” não é sinônimo de “o objetivo foi concluído”. A confirmação final depende da verificação determinística da missão e das evidências.

## 3. Ele finaliza missões corretamente?

O caminho autônomo em `runAutonomousMissionServer.ts` faz a sequência `EXECUTING → agent loop → VERIFYING → Definition of Done`. A missão somente deve chegar a `COMPLETED` com evidência suficiente; sem evidência, o hardening introduziu o estado honesto `INCONCLUSIVE`, em vez de aceitar `force=true` ou a declaração do LLM.

Portanto, a resposta é **sim para missões compatíveis com o modelo atual e que terminem dentro da janela HTTP**, com estas ressalvas:

1. O ciclo autônomo está dentro de uma requisição Next.js de até aproximadamente cinco minutos. Uma missão maior pode ser interrompida no meio e exigir retomada.
2. O checkpoint preserva contadores e contexto, mas não transforma sozinho o processo em worker independente do request.
3. A qualidade da conclusão depende do Definition of Done e da qualidade das evidências produzidas pelas tools. Um objetivo mal especificado pode terminar como `INCONCLUSIVE`, o que é correto.
4. O sistema deve ser submetido a smoke tests autenticados em produção com conectores reais; testes locais não substituem essa validação.

## 4. Ele cria sites, aplicativos e faz deploy?

**Ele já possui peças reais para isso, mas com escopo delimitado.** O runtime inclui filesystem isolado, exportação de artefatos, GitHub, Vercel, Render e Cloudflare. Em particular, há capabilities para criar repositório, escrever arquivos, abrir PR, criar projeto/deployment na Vercel e disparar deploy em providers compatíveis. Escritas exigem aprovação por write gate, o que evita que o modelo publique ou altere infraestrutura sem consentimento.

Na prática, o fluxo suportado é: entender o pedido, produzir/editar arquivos no sandbox ou repositório, executar verificações disponíveis, solicitar autorização para a ação externa e publicar/deployar através do conector autorizado. Isso permite criar sites e alguns aplicativos web de forma funcional.

Ainda não é equivalente a um ambiente de desenvolvimento completo com navegador/computador controlado pelo agente, preview visual iterativo, testes de aceitação gerados automaticamente, correção visual baseada em screenshot e worker que continua por horas. Também não há evidência suficiente para afirmar que **qualquer** aplicativo complexo será entregue com qualidade de produção sem revisão humana.

## 5. Qualidade atual da entrega

### Pontos fortes comprovados

- Isolamento de usuário/tenant, validação de ownership e proteção contra IDOR.
- OAuth com `redirect_uri` exata e PKCE obrigatório.
- Write gates de uso único, com hash do payload e expiração.
- Sanitização/redaction de secrets em respostas, traces e evidências.
- Filesystem com namespace por usuário/execução e proteção contra traversal/symlink.
- Rate limit persistente e checkpoints com compare-and-swap.
- Definition of Done sem bypass para concluir missão sem prova.
- Conectores estruturados por capability, com modo read/write e bloqueio fail-closed.
- Fluxo de chat com streaming, mensagens estruturadas, ferramentas, evidências e sugestões.

### Pontos que ainda impedem a classificação “produção autônoma plena”

- Executor durável fora do ciclo HTTP.
- Retomada automática por scheduler/worker após timeout, crash ou fechamento total do APK.
- Observabilidade central: métricas de latência, custo, taxa de falha, loops interrompidos e missões inconclusivas.
- Testes end-to-end autenticados e smoke periódico de todos os conectores reais.
- Avaliação automática da qualidade de código, acessibilidade, segurança e UI dos artefatos gerados.
- Ferramenta de browser/computer-use genérica com política de aprovação e isolamento.
- Pipeline de correção iterativa com preview e comparação visual.

## 6. Correção entregue nesta PR

O composer agora usa `apps/web/src/components/SendMessageButton.tsx`:

- **Ocioso:** botão semântico de submit com ícone de seta para cima.
- **Processando:** botão semântico de ação com ícone quadrado de parada; não envia outra mensagem acidentalmente.
- **Parada:** aborta o stream local e, quando existe missão ativa, chama `/api/missions/[id]/stop` para cancelar a execution no servidor.
- **Acessibilidade:** `aria-label`, `title`, foco visível e texto para leitores de tela.
- **Regressão coberta:** teste confirma `submit + arrow-up` no estado ocioso e `button + square` no estado de processamento.

## 7. Prioridades recomendadas

### P0 — crítico: executor durável e retomável

Substituir a dependência de uma única requisição HTTP por uma fila/worker com jobs duráveis, retry por etapa, leases, heartbeat e retomada automática. O banco já possui executions e checkpoints; o próximo passo é colocar o ciclo em um executor independente, por exemplo uma solução de jobs compatível com o ambiente escolhido. O contrato deve preservar idempotência, write gates e evidências, sem reexecutar uma escrita já confirmada.

### P0 — crítico: observabilidade e operação

Adicionar tracing por `missionId`/`executionId`, métricas de custo e tokens, duração de tool, taxa de `INCONCLUSIVE`, falhas por provider, cancelamentos e retomadas. Criar alertas para executions presas, aumento de falhas, webhook de billing rejeitado e connector token expirado. Sem isso, o sistema pode estar correto no código e ainda falhar silenciosamente em produção.

### P0 — crítico: suíte E2E autenticada de produção

Automatizar um smoke controlado que valide login, chat streaming, criação de missão, filesystem, aprovação de gate, GitHub, Vercel, banco, cancelamento e conclusão por DoD. O teste deve usar uma conta de teste, dados descartáveis e nunca publicar em produção sem gate explícito.

### P1 — muito importante: browser/computer-use seguro

Adicionar uma capability de navegador isolada, com allowlist de domínios, snapshots, limites de tempo, gravação de evidência e confirmação humana para login, compras, publicação ampla e ações irreversíveis. Hoje os conectores são fortes para APIs, mas não substituem a capacidade de operar sites que não possuem integração direta.

### P1 — muito importante: avaliação de artefatos gerados

Depois de gerar um site ou aplicativo, o Plutão deveria executar typecheck, lint, testes, build, análise de dependências, verificação de secrets, Lighthouse/acessibilidade e smoke HTTP. Para UI, deveria capturar screenshots em viewport mobile/desktop e comparar contra critérios visuais antes de declarar a missão pronta.

### P1 — muito importante: ciclo de correção autônoma

Quando um teste falhar, o runtime deve transformar o erro em uma tarefa de correção, limitar o número de tentativas, reexecutar apenas a etapa necessária e anexar evidência do antes/depois. Isso aproxima o produto do padrão de agentes que implementam, verificam, corrigem e só então entregam.

### P2 — importante: memória, contexto e custo

Evoluir a memória para separar contexto de conversa, memória do projeto, decisões, arquivos e fatos verificados. Adicionar sumarização controlada, recuperação por relevância e orçamento por missão/provedor. O loop já limita tokens, mas ainda precisa de uma política de custo visível para o usuário e de escolha de modelo por etapa.

### P2 — importante: confiabilidade de conectores

Implementar expiração/renovação clara de tokens, health checks, backoff com jitter somente para operações idempotentes, circuit breaker por provider e mensagens de erro orientadas à ação. Escritas nunca devem ser repetidas automaticamente sem idempotency key confirmada.

### P3 — evolução de produto e UX

Continuar o polimento do chat inspirado no Manus, mantendo as cores do Plutão: composer fixo e adaptativo, estados claros de trabalhando/parado, mensagens longas legíveis, código com copy, ações agrupadas, timeline de ferramentas, indicador de conexão e navegação mobile que não bloqueie o scroll. A base já existe, mas merece testes reais em diferentes WebViews Android, tamanhos de fonte e orientação de tela.

## 8. Comparação responsável com Manus, Claude e Grok

A comparação abaixo é de capacidades públicas, não uma afirmação de implementação interna desses produtos.

| Referência | Padrão público relevante | Implicação para o Plutão |
|---|---|---|
| Manus | Produto orientado a executar tarefas e ações, com geração de websites, slides, jogos, vídeo e design | O Plutão precisa transformar o loop em executor durável e melhorar preview/correção de artefatos |
| Claude Computer Use | O modelo propõe ações, o executor realiza, devolve resultado e o ciclo continua; a aplicação controla ferramentas e limites | Falta ao Plutão uma camada genérica de computador/browser, com isolamento e aprovação |
| Grok tools | Tool calling com pesquisa web, X, código, imagem, collections e funções customizadas | O Plutão tem conectores fortes, mas precisa ampliar cobertura de ferramentas e roteamento por tarefa |

Fontes oficiais consultadas: [Manus](https://manus.im/), [Anthropic Computer Use](https://docs.anthropic.com/en/docs/build-with-claude/computer-use) e [xAI Tools](https://docs.x.ai/developers/tools/overview).

## 9. Conclusão

O Plutão está em um estágio **funcional e tecnicamente bem endurecido**, capaz de conversar, executar tools autorizadas, produzir artefatos, operar repositórios/deploys por conectores e concluir missões com verificação. O maior risco restante não é o botão de enviar nem a ausência de um loop básico: é a **durabilidade operacional de missões longas** e a falta de uma validação E2E contínua em produção.

A recomendação é priorizar, nesta ordem: **worker durável**, **observabilidade**, **E2E autenticado**, **browser/computer-use seguro** e **avaliação automática dos artefatos**. Com esses itens, o Plutão deixa de ser apenas um runtime de agente dentro de uma requisição e se aproxima de uma plataforma de execução autônoma confiável.
