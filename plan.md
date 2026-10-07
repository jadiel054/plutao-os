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
