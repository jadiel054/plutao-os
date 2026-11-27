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
