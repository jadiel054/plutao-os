# Relatório de verificação funcional em produção — 17/09/2026

**Ambiente:** [https://plutao-os.vercel.app](https://plutao-os.vercel.app)  
**Perfil:** usuário externo em conta de teste dedicada  
**Conta:** criada durante o teste com endereço não pessoal; não registrar credenciais no repositório  
**Objetivo:** observar o Plutão como um usuário novo e verificar o que está funcional no fluxo real publicado.

> Este relatório registra comportamento observado em produção. Ele não substitui a especificação arquitetural nem transforma uma tela existente em uma capacidade implementada.

## Resumo executivo

O fluxo principal de acesso funciona: uma pessoa consegue criar uma conta, entrar, salvar o perfil do agente, criar uma missão, executar o ciclo autônomo, receber uma resposta de modelo, consultar evidências, adicionar uma subtarefa, sair e entrar novamente recuperando os dados.

A execução testada alcançou `VERIFYING`, registrou um `model_step` e produziu uma resposta. A verificação DoD falhou de forma coerente porque a missão não produziu um `tool_result` nem um efeito real de ferramenta. O sistema bloqueou a conclusão, em vez de declarar sucesso indevidamente. Portanto, o teste confirma o gate e o fluxo de geração de plano, mas não confirma uma missão completa com efeito de ferramenta.

## Matriz do teste

| Fluxo | Resultado observado | Estado documentado |
| --- | --- | --- |
| Página inicial pública | Carregou com navegação para entrar e criar conta | Funcional |
| Cadastro | Conta criada e redirecionamento para `/cockpit` | Funcional |
| Login | Login inicial e login após logout concluídos | Funcional |
| Logout | Redirecionou para `/login` | Funcional |
| Persistência | Missão, perfil e modo Offline permaneceram após novo login | Funcional no fluxo testado |
| Perfil do agente | Salvo com toast de sucesso | Funcional |
| Criação de missão | Missão criada e listada como `CREATED` | Funcional |
| Execução autônoma | Alcançou `VERIFYING` e gerou uma resposta de modelo | Funcional até a verificação |
| Evidência | Um registro de `model_step` apareceu na timeline e no painel | Funcional para esse tipo de registro |
| DoD | Falhou com critérios visíveis e bloqueou `COMPLETED` | Funcional como gate |
| Subtarefa | Subtarefa criada e apareceu na timeline como `CREATED` | Funcional |
| Chat | Respondeu a uma mensagem simples e exibiu histórico | Funcional |
| Modos | `Offline` foi selecionado, exibido como `OFFLINE (CPU)` e persistiu | Funcional na preferência; inferência local não foi comprovada neste smoke test |
| Modelos | Catálogo exibiu 8 modelos, 1 local pronto e ações de uso/teste/download | UI funcional; cada modelo não foi executado individualmente |
| Configurações | Abas Conta, Notificações, Privacidade e Sobre carregaram | Funcional como interface |
| Links legais | Ajuda, Termos, Privacidade e Licenças retornaram 404 | Páginas previstas para próxima etapa; ainda não publicadas |
| Responsividade | Alternância desktop/mobile alterou o controle e manteve o cockpit utilizável | Funcional na verificação visual |

## Roteiro executado

### 1. Entrada e autenticação

A página inicial carregou corretamente. Foi criada uma conta de teste com nome, e-mail sintético e senha dedicada. O cadastro redirecionou para o cockpit autenticado. Após logout, o login com a mesma conta redirecionou novamente para o cockpit.

### 2. Perfil do agente

O perfil padrão foi salvo pelo botão **Salvar Perfil**. A aplicação exibiu o toast `Perfil do agente salvo com sucesso!`.

### 3. Missão e execução

Foi criada a missão:

> Criar um plano de três passos para organizar uma pequena rotina diária e verificar cada passo.

A missão apareceu como `CREATED`. Ao acionar **Executar missão**, o sistema registrou uma execução, avançou até `VERIFYING` e produziu um plano textual por meio do modelo configurado. A timeline exibiu a execução e o registro `model:groq:openai/gpt-oss-120b · model_step`.

### 4. Verificação DoD

O painel exibiu `FAILED` com os seguintes resultados:

- havia uma evidência registrada;
- não havia `tool_result` nem leitura/escrita real de ferramenta;
- havia progresso de `model_step`.

A aplicação informou que `COMPLETED` estava bloqueado até a correção das evidências. Esse comportamento é importante: o sistema não tratou uma resposta textual do modelo como prova de efeito real.

### 5. Tarefa e checkpoint

Uma subtarefa foi adicionada com sucesso e apareceu na timeline como `Tarefa · CREATED`. Foi iniciado o teste de checkpoint, mas a interface apresentou o estado `TERMINAL` sem uma confirmação clara de persistência da nota; esse fluxo deve ser revalidado antes de ser descrito como verificado em produção.

### 6. Chat

O Chat respondeu à mensagem:

> Olá, faça um resumo em uma frase do que você consegue fazer.

A resposta foi exibida e o histórico passou a mostrar `Histórico (2)`, confirmando a persistência do par pergunta/resposta no fluxo testado.

### 7. Configurações e modos

Foram observados:

- catálogo com 8 modelos e indicação de 1 modelo local;
- modo `Auto`, `Online` e `Offline`;
- conta e identidade do agente;
- preferências de notificações;
- controles de privacidade, exportação JSON e ações destrutivas;
- versão exibida como `0.1.0`.

O modo Offline foi selecionado, gerou o aviso `Modo Offline ativado`, apareceu no cockpit como `OFFLINE (CPU)` e permaneceu selecionado depois de sair e entrar novamente. Este teste confirmou a preferência e a apresentação do modo, mas não confirmou inferência local completa nem execução offline de uma missão.

### 8. Links públicos

Os links abaixo foram acessados diretamente e retornaram uma página 404:

- `/ajuda`;
- `/legal/termos`;
- `/legal/privacidade`;
- `/legal/licencas`.

Eles ainda não devem ser apresentados como páginas publicadas. O resultado é compatível com o planejamento atual: as páginas serão implementadas posteriormente com conteúdo próprio.

## Evidências visuais

A captura da página inicial pública, sem dados da conta de teste, foi preservada em [`captura-home.webp`](captura-home.webp). Capturas autenticadas não foram incorporadas porque continham endereço de e-mail de teste e overlays de inspeção do navegador, inadequados para uma imagem pública do repositório.

## Limites do teste

Este smoke test não confirmou individualmente todos os modelos do catálogo, inferência local real em WebGPU/CPU, OAuth GitHub, conectores, fila offline em perda real de rede, exportação JSON, exclusão de conta, notificações efetivas ou efeitos reais das ferramentas de filesystem. Esses itens continuam devendo ser classificados por testes específicos, não por inferência a partir da presença de botões ou componentes.

## Próximas correções documentais e de produto

1. Implementar os quatro links públicos previstos com conteúdo próprio e validar as rotas após a publicação.
2. Documentar o checkpoint como verificado somente após uma nova execução que confirme a nota na timeline e após reload/login.
3. Criar um teste específico de missão com `tool_result` real para verificar o caminho até `COMPLETED`.
4. Criar um teste separado para inferência local em modo Offline; a preferência persistida não é evidência suficiente de execução local.
5. Manter a distinção entre registros de evento/evidência existentes e uma futura Evidence Engine independente.
