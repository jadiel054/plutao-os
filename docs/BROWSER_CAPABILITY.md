# BROWSER_CAPABILITY.md — Plutão

Especificação da capacidade de navegador do Plutão. Este documento nasceu de uma
análise externa (Kimi, consolidada em cima de uma proposta de integrar Skyvern/
Playwright/Stagehand) mais uma auditoria contra o estado real do repositório em
17/09. Ele substitui a leitura original onde ela tratava arquitetura planejada
como capacidade já implementada.

**Status geral:** DESIGNED — nada da Browser Capability em si está implementado
ainda. Este documento é o contrato antes do código.

---

## 1. Posicionamento arquitetural

Browser **não** é um agente paralelo com seu próprio loop de decisão. É uma
**Capability** subordinada ao cérebro que o Plutão já tem:

```
Plutão Planner → Tool Broker → Browser Controller → Backend (Playwright/CDP)
```

Rejeitado: colocar um framework de terceiro (ex. Skyvern) como núcleo do
browser. Isso duplicaria autoridade — planejamento, permissão, orçamento e
verificação continuam só no Plutão (Planner / Tool Broker / Evidence Engine /
DoD Gate), nunca dentro do backend de browser.

**Decisão:** ACEITA.

---

## 2. Backend de execução — V1 é decisão de implementação, não dependência conceitual

O Browser Controller fala com um `BrowserBackend` abstrato. V1 permite mais de
uma implementação por trás da mesma interface, escolhida por config/env, sem o
resto do sistema (Tool Broker, Evidence Engine, missões) saber qual está ativa:

- **`BrowserbaseBackend`** (remoto, gerenciado) — usado como *spike* inicial
  para validar rápido a experiência de live view. Free tier: sessão limitada a
  ~15 min, sem CAPTCHA solving, retenção de dado de 7 dias. Bom para prototipar,
  não para missões longas.
- **`SelfHostedBackend`** (Playwright próprio, worker fora da Vercel — ex. Render
  free tier, sob demanda) — caminho de produção, sem dependência de terceiro
  para uma capacidade que é núcleo do produto.

Um dos dois é *primary* de cada vez; o outro fica documentado como
roadmap/fallback, para não gastar esforço de teste em dobro nas duas
implementações ao mesmo tempo antes do M4/M5 existirem.

**Decisão:** ACEITA. Nenhum dos dois backends está implementado ainda.

---

## 3. `extract()` — separar determinístico de semântico

`navigate · click · type · extract · screenshot · wait` compõem o Browser
Controller determinístico — **exceto** que `extract` pode significar duas
coisas diferentes:

```
Browser Controller V1
├── extract determinístico
│   ├── selector
│   ├── attribute / text
│   ├── DOM estruturado
│   └── accessibility tree
└── extração semântica (instrução em linguagem natural → LLM)
    └── NÃO pertence ao core determinístico V1
        → fica para uma camada de Model Gateway futura (Stagehand-class)
```

Stagehand (ou equivalente) é inteligência **opcional**, nunca requisito. O
princípio geral do Plutão se mantém: determinístico primeiro, inteligência
só quando necessária.

**Decisão:** ACEITA.

---

## 4. Evidência por classe, não evidência pesada por tool call

Regra conceitual: cada tool call gera evidência. Na prática, isso não deve
significar screenshot + DOM + logs de console/rede em toda operação — um
`wait(500ms)` não precisa do mesmo peso que um `click` que muda o estado da
página.

Classes de evidência:

```
ACTION_RESULT
SCREENSHOT
DOM_SNAPSHOT
ACCESSIBILITY_TREE
NETWORK_EVENT
CONSOLE_EVENT
DOWNLOAD
EXTRACTION
```

O contrato de cada operação declara a evidência mínima obrigatória; isso
preserva o DoD Gate sem transformar o browser numa máquina de armazenar
screenshot.

**Decisão:** ACEITA.

---

## 5. Live view + Human Takeover

Inspirado no "Computador do Manus" (painel que mostra ao vivo navegador/
comandos, com botão "Assumir controle"). Isso **não** é uma capability nova —
é a camada de observabilidade em cima da evidência que a Browser Capability já
produz (classe `SCREENSHOT`/`ACTION_RESULT` transmitida quase em tempo real via
WS/SSE em vez de só arquivada).

Human Takeover (pausar o agente e devolver controle ao usuário numa sessão ao
vivo) estava marcado como V2/"decisão prudente" na análise original. Fica
reclassificado como candidato a subir de prioridade — é o que dá confiança
para deixar o agente navegar sozinho em sites reais — mas **sequenciado depois**
do M4/M5 abaixo, não antes.

**Decisão:** ACEITA / AGENDADA, pós-M4/M5. Spike de validação sugerido com o
backend Browserbase (live view já embutido); worker próprio no Render como
caminho de produção quando a sessão de 15 min do free tier virar limitação
real.

---

## 6. Self-testing missions (Plutão testando Plutão)

Quando a Browser Capability existir, o próprio Plutão pode rodar missões de
fumaça fim a fim sobre sua própria produção (criar conta → login → abrir
cockpit → criar missão → executar → observar → coletar evidência → verificar
estado esperado). Isso aproxima o Plutão da visão de Autonomous AI Operating
System em vez de chatbot com ferramentas — mas depende de M4/M5 e da própria
Browser Capability estarem prontos primeiro.

**Decisão:** ACEITA / FUTURO, sem prazo.

---

## 7. Matriz de status (auditada em 17/09 contra o repositório)

Nenhum destes é ainda parte da Browser Capability — é o estado dos mecanismos
que ela vai depender/reusar, para não confundir arquitetura especificada com
código real:

| Mecanismo | Status | Observação |
|---|---|---|
| Tool Broker dedicado | MISSING | Tools hoje vivem soltas em runtime/cockpit/missions; não há módulo único de mediação |
| Permission Engine | MISSING | Não localizado como módulo próprio em `packages/domain` |
| Approval Engine | MISSING | Idem |
| Sandbox (filesystem) | IMPLEMENTED | `apps/web/sandbox`, Filesystem Tool V1 (list/read/write/mkdir/stat) |
| Sandbox (web/browser) | MISSING | Não existe ainda — é o que este documento especifica |
| Network Policy | MISSING | Não localizada |
| Evidence Engine | MISSING | Existe registro de eventos de missão (`plan.events`), mas não uma engine de evidência por classe como a seção 4 propõe |
| DoD Gate / failure gate | IMPLEMENTED | Mission Workspace V1: `FAILED → INSPECTING → FIXING → TESTING → PASSED` (PR #11, #25) |
| Conectores (OAuth GitHub) | IMPLEMENTED | M1–M3 (PR #24); M4 (bridge tools → dispatcher) e M5 (smoke mission) PENDENTES |
| Browser Backend (qualquer) | MISSING | Zero código ainda; este doc é o contrato antes da implementação |

**Próxima ação de engenharia recomendada:** não implementar Browser ainda.
Primeiro, Tool Broker + Permission/Approval Engine mínimos — sem eles, dar ao
Plutão poder de navegar sites de verdade repete o problema que a rejeição do
Skyvern (seção 1) tentou evitar, só que por outra porta.

---

## Ver também

- `docs/DECISIONS.md` — entrada "Computador / browser virtual" em Decisões em
  aberto / Evoluções futuras
- `docs/CURRENT_STATE.md` — status vivo de M1–M5 (conectores)
