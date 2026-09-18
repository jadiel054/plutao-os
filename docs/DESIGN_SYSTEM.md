# DESIGN_SYSTEM.md — Plutão

**Status:** Baseline v0.3 (BRAND-001 + motion tokens)  
**Princípios:** Profissional • Sóbrio • Leve • Mobile-first • Informação em destaque  
**Marca:** ver [BRAND.md](./BRAND.md) (grade 24×24 · φ · Grafite/Platina)

---

## 1. Identidade

- **Nome:** Plutão
- **Tagline provisória:** Seu sistema operacional autônomo de IA
- **Tom:** Preciso, calmo, confiável, técnico sem ser frio
- **Personalidade visual:** “Cockpit de missão” — denso o suficiente para trabalhar, respirável o suficiente para longas sessões
- **Mark:** losango núcleo `#9CD9C2` + brackets assimétricos `#5FA88C` (nunca deformar o núcleo)

---

## 2. Cores (Dark-first) — BRAND-001

### Brand (marca)

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg` / `--base` | `#0B0D0C` | Fundo principal |
| `--surface` | `#182420` | Cards, painéis |
| `--surface-elevated` / `--pinho` | `#1F3D33` | Modais, overlays |
| `--mid` | `#2E5C4C` | Bordas ativas / mid |
| `--border` | `#2E5C4C` | Bordas |
| `--text-primary` / papel | `#F5F3EE` | Texto principal |
| `--text-secondary` / núcleo | `#9CD9C2` | Texto secundário / vivos |
| `--text-muted` / selo | `#5FA88C` | Metadados |
| `--accent` / `--selo` | `#5FA88C` | Ações primárias de marca |
| `--accent-hover` / `--nucleo` | `#9CD9C2` | Hover / destaque |
| `--papel` | `#F5F3EE` | Light surfaces / impressão |

### Status (funcionais — não são a marca)

| Token | Valor | Uso |
|-------|-------|-----|
| `--cyan` | `#9CD9C2` | Executando / vivo (alinhado ao núcleo) |
| `--success` | `#10B981` | Completed / PASSED |
| `--warning` | `#F59E0B` | Blocked / FAILED sóbrio (card) |
| `--danger` | `#EF4444` | Marcador de passo falhou / erro |

Indigo legado (`#6366F1`) **não** é accent de marca (BRAND-001).

### Light

Usar `--papel` como fundo e inverter contraste mantendo selo/núcleo. Prioridade secundária.

---

## 3. Tipografia

- **UI / Interface:** `Inter` (fallback `system-ui, sans-serif`); Geist no app atual é aceitável até troca deliberada
- **Código / Logs / Evidência:** mono (`JetBrains Mono` / `Geist Mono` / `ui-monospace`)
- Escala: `text-xs` 12 → `text-2xl` 24; títulos de missão `font-semibold`

---

## 4. Ícones

- **Marca / PWA:** `assets/brand` + `apps/web/public/icon_192.png` / `icon_512.png`
- **UI:** [Lucide](https://lucide.dev)
- **Terceiros:** oficiais da marca
- Tamanhos UI: 16 / 20 / 24

---

## 5. Loading / Feedback

- [LDRS](https://uiball.com/ldrs) só em espera real

---

## 6. Componentes e padrões de UI

### Cockpit prioritário

1. Mission Input  
2. Mission Status  
3. What needs user  
4. Timeline  
5. Evidence / Artifacts  
6. Logs (colapsáveis)

### Status badges

- `CREATED` → neutro  
- `UNDERSTANDING` / `PLANNING` → accent  
- `EXECUTING` → cyan/núcleo  
- `VERIFYING` → accent  
- `COMPLETED` → success  
- `BLOCKED` / `FAILED` → warning / danger  
- `CANCELLED` → muted

### Passos do plano (idioma visual)

| Estado | Marcador |
|--------|----------|
| `PENDING` | círculo oco mid |
| `RUNNING` / `TESTING` / `FIXING` / `INSPECTING` | ponto núcleo pulsante |
| `PASSED` | ✔ success |
| `FAILED` | ✗ danger no passo; **card** com glow âmbar sóbrio (não vermelho piscante) |
| `CANCELLED` | traço muted |

### Nav / abas

- Mobile: nav inferior em **pills** (borda mid; ativa com preenchimento selo ~14%).
- Não duplicar abas no header do chat.

### Chips de atalho

- Sugestões iniciais de conversa: ocultam após a 1ª mensagem do usuário e **não voltam** na mesma conversa.
- Seletor de missão ativa (“Só chat” / missões) é independente e pode permanecer.

---

## 7. Motion (tokens de produto)

**Regra de ouro:** evento comum = discreto; evento raro = pode ser celebrativo ou carregar marca.

| Momento | Comportamento | Duração alvo |
|---------|---------------|--------------|
| Chat ocioso | Blobs de fundo só em cores de marca (opcional; CSS puro) | contínuo suave |
| Foco no campo | Glow selo que dissolve | ~2,5 s |
| Início de execução | Pulso anel núcleo (1×) | ~0,9 s |
| `EXECUTING` | Borda card selo→núcleo (ou fallback opacidade) | contínuo discreto |
| Checkpoint `PASSED` | Card “respira” verde discreto | ~2,4 s |
| Checkpoint `FAILED` | Glow âmbar sóbrio no card + ✗ no passo | até sair do loop |
| Entrega comum | Borda núcleo + confete canvas (cores marca) | 3–4 s |
| **Marco** (raro) | Overlay de propósito + confete | ~4 s |

**Sempre** respeitar `prefers-reduced-motion: reduce` → estados estáticos, sem confete/pulso.

Implementação: classes em `apps/web/src/app/globals.css` (`.mission-motion*`). Front só reage a estados do runtime — sem seletor de demo no produto.

### Copy de marco (overlay)

Texto **factual**, ligado a regra de produto — não tagline de marketing genérica.

| Marco | Título | Linha de apoio | Meta |
|-------|--------|----------------|------|
| 1ª missão concluída | Primeira missão concluída | Objetivo alinhado. Evidência registrada. | ENTREGA #1 · MARCO |
| Nª entrega (comum com marco configurável) | Missão concluída | {passed}/{total} checkpoints · resumo no Cockpit | ENTREGA #{n} |
| 1º merge em `main` (quando houver sinal) | Primeiro merge em main | Código no caminho real. Próximo: verificar produção. | MARCO · MAIN |

Marca no overlay: “Plutão OS” (nome) — sem slogans longos. Confete em entregas; overlay de propósito **só** em marcos configuráveis (1ª missão, 1º merge, Nª missão).

---

## 8. PWA / Atualizações

- Service Worker: versionamento + `skipWaiting` + `clients.claim`
- theme_color / background: `#0B0D0C`

---

## 9. Tokens no código

Implementados em `apps/web/src/app/globals.css` (BRAND-001 + motion).

---

## 10. Evolução

Mudanças de marca → `BRAND.md` + `DECISIONS.md`.  
Mudanças só de UI / motion → este arquivo.
