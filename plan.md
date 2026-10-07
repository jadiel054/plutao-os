# Plano — atualização do APK e polimento de interface

## Objetivo
Entregar uma nova PR sobre a `main` que transforme o aviso de atualização nativo em um card de atualização claro, seguro e acionável, e eleve a interface do Plutão sem abandonar sua identidade verde-platinada.

## Design
- **Movimento:** workspace conversacional premium, inspirado na clareza do Manus, sem copiar marca ou cores.
- **Princípios:** hierarquia silenciosa; estados sempre visíveis; conteúdo legível em telas estreitas; ações reversíveis e confirmadas.
- **Cores:** manter grafite esverdeado, selo verde e platina; reservar âmbar/vermelho para atenção/erro.
- **Layout:** superfícies empilhadas, balões com largura adaptativa e painel de atualização com resumo + ação primária.
- **Elementos assinatura:** borda de selo, status de versão em cápsula e trilha de metadados monospace.
- **Interação:** todo botão comunica hover, foco, disabled e resultado; atualização obrigatória não pode ser dispensada.
- **Animação:** transições curtas; respeitar `prefers-reduced-motion`.
- **Tipografia:** Geist para interface e Geist Mono apenas em versões, hashes e estados técnicos.
- **Essência:** um operador pessoal que transforma intenção em execução verificável. Adjetivos: cuidadoso, direto, evolutivo.
- **Voz:** CTAs curtos e honestos: “Ver atualização” / “Baixar versão segura”.

## Implementação
1. Evoluir o manifesto para incluir tamanho, data, hash e notas sanitizáveis no card nativo.
2. Criar um `UpdateCard` nativo com versão atual, nova versão, notas, tamanho, release e ações; abrir a central no modo nativo e preservar fallback web.
3. Melhorar a central `/download` com resumo da versão, instrução Android em etapas, confiança/hashes e estados vazios/erro.
4. Refinar balões, Markdown, composer e estados de foco/erro do chat.
5. Adicionar testes de componentes e de parsing/segurança; rodar typecheck, lint, suíte Vitest e build.

## Estrutura
- `apps/web/src/components/UpdateChecker.tsx`: estado e card nativo.
- `apps/web/src/app/download/page.tsx`: central de releases.
- `apps/web/src/components/chat/*`: renderização e ações de mensagens.
- `apps/web/src/app/globals.css`: tokens, focus ring e superfícies.

## Entitlement protegido do proprietário

O plano do proprietário é uma concessão de produto persistida no registro da conta, não um alias secreto no código. `users.plan_locked` impede que eventos Stripe de cancelamento ou expiração rebaixem essa conta, mas mantém os IDs de customer/subscription sincronizados para auditoria. A migration é aditiva e a ativação do lock é uma operação explícita, única e restrita ao registro confirmado em produção.

## Scroll do chat no APK

O histórico usa um único container com altura flexível e `min-h-0`; o auto-scroll só acompanha novas mensagens quando o usuário permanece próximo ao fim. Ao rolar manualmente, a posição é preservada, existe uma ação explícita para voltar ao início e um botão contextual para retornar à mensagem mais recente. A viewport do shell fica limitada a `100dvh` para impedir que o WebView crie uma página interna que capture o gesto de rolagem.


# Plano — plataforma autônoma confiável

## Resultado pretendido

Entregar uma fundação incremental para execução autônoma confiável sem misturar responsabilidades: missões criadas no Chat continuam orientadas pelo agente; missões criadas manualmente no Cockpit permanecem regidas pelo Cockpit e só recebem ajuda conversacional quando o usuário solicitar.

## Escopo desta PR

1. **Worker durável:** fila persistida em Neon, lease/claim atômico, retries limitados, recuperação de jobs abandonados e endpoint protegido por `CRON_SECRET`; o request atual enfileira a execução antes de rodar e o worker pode retomá-la após timeout/crash.
2. **Observabilidade:** telemetria estruturada com `requestId`, `missionId`, `executionId`, job, duração, status, tentativa, erro sanitizado e contadores básicos; armazenada no `audit_events` existente e exposta por endpoint autenticado para a missão aberta.
3. **E2E autenticado:** roteiro Playwright executável sob demanda com secrets, login por e-mail/senha, criação de missão descartável, abertura no Cockpit, leitura de evidência e limpeza; não roda automaticamente contra produção sem secrets explicitamente configurados.
4. **Browser/computer-use seguro:** contrato e controller determinístico com allowlist de host, bloqueio de esquemas perigosos, limite de navegação, `navigate`/`extract`/`screenshot` como ações de leitura e todo efeito futuro marcado como não implementado até backend isolado; sem inventar automação remota ou contornar aprovação.
5. **Avaliação automática de artefatos:** avaliador determinístico para arquivos de missão (tamanho, tipo, secrets, HTML perigoso, JSON válido, código com sinais de erro) e resultado anexado à evidência/DoD como `artifact_evaluation`.
6. **Chat flutuante do Cockpit:** botão visual fixo que abre um composer compacto usando a API de Chat, enviando `missionId` somente quando o usuário explicitamente vincular a missão aberta; sem criar ou executar missão manual automaticamente. O default será conversa de ajuda do Cockpit, com indicador claro de contexto.

## Decisões de design

**Movimento:** cockpit operacional premium, inspirado em interfaces de agentes com superfícies escuras, densidade controlada e estados vivos, sem copiar marca externa.

**Princípios:** estado sempre visível; uma ação principal por superfície; evidência antes de promessa; separação explícita entre intenção manual e autonomia do agente.

**Cores:** manter base escura e acentos originais do Plutão (`--selo`, `--nucleo`), usando âmbar para atenção, verde para conclusão e vermelho somente para falha/cancelamento.

**Layout:** Cockpit permanece painel de missão; o chat flutuante é uma camada contextual recolhível, ancorada no canto inferior e respeitando safe area/mobile navigation.

**Interação:** botão mostra estado `Abrir agente`, `Agente pensando`, `Parar`; cada falha retorna toast e estado, nunca ação silenciosa. O usuário precisa escolher “ajudar esta missão” para enviar `missionId`.

**Tipografia e voz:** manter a escala atual, microcopy curta e operacional: “Ajuda do agente” e “Esta missão continua sob controle do Cockpit”.

## Estrutura prevista

- `packages/db/src/schema.ts` e migration `0024_autonomous_platform_foundation.sql`: jobs duráveis e índices.
- `apps/web/src/lib/runtime/durableJobs.ts`: enqueue, claim, heartbeat, sucesso/falha e requeue.
- `apps/web/src/app/api/cron/runtime-worker/route.ts`: worker protegido e limitado por lote.
- `apps/web/src/lib/observability/runtimeTelemetry.ts`: eventos estruturados e sanitizados.
- `apps/web/src/app/api/missions/[id]/telemetry/route.ts`: leitura autenticada por ownership.
- `apps/web/src/lib/runtime/tools/browser.ts`: contrato seguro de browser determinístico, sem backend remoto implícito.
- `apps/web/src/lib/runtime/tools/artifactEvaluator.ts`: avaliação determinística.
- `apps/web/src/components/CockpitAgentFab.tsx`: botão flutuante e composer contextual.
- `apps/web/src/app/(app)/cockpit/page.tsx`: integração sem alterar a autoridade das missões manuais.
- `e2e/authenticated-cockpit.spec.ts` e workflow manual: smoke autenticado opt-in.

## Limites

Não serão adicionados tokens, credenciais, automação de CAPTCHA, navegador irrestrito, execução de escrita sem write gate, ou conclusão automática de missão manual a partir do chat. O backend real de browser permanece um adaptador futuro; esta PR torna a fronteira segura e testável, sem fingir que Playwright remoto já está disponível.
