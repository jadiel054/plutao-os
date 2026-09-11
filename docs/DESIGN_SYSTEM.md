# DESIGN_SYSTEM.md — Plutão

**Status:** Baseline v0.2 (alinhado a BRAND-001)  
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
| `--success` | `#10B981` | Completed |
| `--warning` | `#F59E0B` | Blocked / atenção |
| `--danger` | `#EF4444` | Failed / erro |

Indigo legado (`#6366F1`) **não** é mais accent de marca (BRAND-001).

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

---

## 7. PWA / Atualizações

- Service Worker: versionamento + `skipWaiting` + `clients.claim`
- theme_color / background: `#0B0D0C`

---

## 8. Tokens no código

Implementados em `apps/web/src/app/globals.css` (BRAND-001).

---

## 9. Evolução

Mudanças de marca → `BRAND.md` + `DECISIONS.md`.  
Mudanças só de UI → este arquivo.
