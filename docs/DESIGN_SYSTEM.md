# DESIGN_SYSTEM.md — Plutão

**Status:** Baseline v0.1  
**Princípios:** Profissional • Sóbrio • Leve • Mobile-first • Informação em destaque

---

## 1. Identidade

- **Nome:** Plutão
- **Tagline provisória:** Seu sistema operacional autônomo de IA
- **Tom:** Preciso, calmo, confiável, técnico sem ser frio
- **Personalidade visual:** “Cockpit de missão” — denso o suficiente para trabalhar, respirável o suficiente para longas sessões

---

## 2. Cores (Dark-first)

### Dark (padrão)

| Token                  | Valor       | Uso                              |
|------------------------|-------------|----------------------------------|
| `--bg`                 | `#0B0F19`   | Fundo principal                  |
| `--surface`            | `#111827`   | Cards, painéis                   |
| `--surface-elevated`   | `#1F2937`   | Modais, dropdowns                |
| `--border`             | `#374151`   | Bordas sutis                     |
| `--border-subtle`      | `#1F2937`   | Separadores                      |
| `--text-primary`       | `#F9FAFB`   | Texto principal                  |
| `--text-secondary`     | `#9CA3AF`   | Texto secundário / labels        |
| `--text-muted`         | `#6B7280`   | Placeholders, metadados          |
| `--accent`             | `#6366F1`   | Ações primárias, links           |
| `--accent-hover`       | `#818CF8`   | Hover do accent                  |
| `--accent-muted`       | `#312E81`   | Backgrounds de accent            |
| `--cyan`               | `#22D3EE`   | Status “vivo / executando”       |
| `--success`            | `#10B981`   | Sucesso / completed              |
| `--warning`            | `#F59E0B`   | Atenção / blocked                |
| `--danger`             | `#EF4444`   | Erro / failed / cancel           |

### Light (disponível desde o início)

Será definido com os mesmos tokens semânticos (valores invertidos de forma harmoniosa). Prioridade secundária na Phase 1.

---

## 3. Tipografia

- **UI / Interface:** `Inter` (com fallback `system-ui, sans-serif`)
- **Código / Logs / Evidência:** `JetBrains Mono` ou `Geist Mono` / `ui-monospace`
- **Escala (aproximada):**
  - `text-xs` → 12px
  - `text-sm` → 14px
  - `text-base` → 16px
  - `text-lg` → 18px
  - `text-xl` → 20px
  - `text-2xl` → 24px
  - Títulos de missão / página: `text-xl` ou `text-2xl` com `font-semibold`

Hierarquia clara. Evitar muitos pesos.

---

## 4. Ícones

- **Biblioteca principal:** [Lucide](https://lucide.dev) (leve, consistente, profissional)
- **Ícones de terceiros:** sempre os oficiais da marca (GitHub, Vercel, OpenAI, Anthropic, etc.)
- **Tamanhos padrão:** 16px (inline), 20px (botões), 24px (destaque)

---

## 5. Loading / Feedback

- **Biblioteca:** [LDRS](https://uiball.com/ldrs) (leve)
- Usar **somente** onde houver espera real (início de missão, execução de ferramenta, verificação, deploy, etc.)
- Nunca loading decorativo ou infinito sem feedback de progresso quando possível

---

## 6. Componentes e padrões de UI

### Cockpit prioritário

1. **Mission Input** — sempre acessível
2. **Mission Status** — estado atual + o que está acontecendo agora
3. **What needs user** — aprovações e bloqueios em destaque
4. **Timeline** — eventos da missão (leve, vertical)
5. **Evidence / Artifacts** — resultados verificáveis
6. **Logs** — sob demanda / colapsáveis

### Status badges (exemplos)

- `CREATED` → neutro
- `UNDERSTANDING` / `PLANNING` → accent
- `EXECUTING` → cyan (pulsante sutil se necessário)
- `VERIFYING` → accent
- `COMPLETED` → success
- `BLOCKED` / `FAILED` → warning / danger
- `CANCELLED` → muted

### Densidade

- Alta densidade de informação útil
- Espaçamento generoso entre grupos lógicos
- Evitar “card hell”
- Mobile: bottom navigation ou sheet para ações principais quando fizer sentido

---

## 7. PWA / Atualizações

- O PWA deve receber atualizações do Vercel de forma transparente.
- Estratégia: Service Worker com versionamento de cache + `skipWaiting` + `clients.claim`.
- O usuário não deve precisar desinstalar e reinstalar o PWA para receber novas versões.

---

## 8. Tokens Tailwind (referência)

Serão adicionados em `tailwind.config` / CSS variables no `apps/web` quando o projeto for inicializado.

Exemplo de mapeamento:

```css
:root {
  --bg: #0B0F19;
  --surface: #111827;
  --accent: #6366F1;
  --cyan: #22D3EE;
  /* ... */
}
```

---

## 9. Evolução

Este documento é vivo.  
Qualquer mudança visual relevante deve ser registrada aqui e em `DECISIONS.md`.
