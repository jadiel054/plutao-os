# Plutão OS — Brand System

**Status:** DECIDED (BRAND-001)  
**Repo:** `jadiel054/plutao-os`  
**Grade:** 24×24 · **φ:** 1.618 · **Paleta:** Grafite e Platina Esverdeada

## 1. Princípios geométricos (origem na spec)

| Spec | Princípio | Tradução geométrica |
|------|-----------|---------------------|
| §3.4 | Núcleo intocável | Losango central `(12,9)(15,12)(12,15)(9,12)` — nunca sobreposto, nunca deformado. Representa o kernel protegido. |
| §11 | Subagents / φ | Braços em razão áurea aproximada: 8:5 e 5:3 → φ 1.618 |
| §9 | Runtime assimetria | Diagonais e pesos diferentes (8+5 vs 5+3). Equilíbrio sem espelhamento. Sistema vivo. |

## 2. Selo (mark)

- **Núcleo:** losango `#9CD9C2` (platina esverdeada)
- **Selo / brackets:** L assimétricos `#5FA88C`
- **Nível 1** (<28px): apenas o núcleo
- **Nível 2** (28–95px): cor única
- **Nível 3** (≥96px): dois tons

Arquivos: `assets/brand/vectors/mark.svg`, `mark_dark.svg`

## 3. Paleta oficial

| Token | Hex | Uso |
|-------|-----|-----|
| `--base` / `--bg` | `#0B0D0C` | Fundo principal (dark) |
| `--surface` | `#182420` | Superfícies / cards |
| `--mid` | `#2E5C4C` | Mid-tone, bordas ativas |
| `--selo` / accent marca | `#5FA88C` | Brackets, accent de marca |
| `--nucleo` | `#9CD9C2` | Losango, destaques vivos |
| `--pinho` | `#1F3D33` | Overlay profundo |
| `--papel` | `#F5F3EE` | Fundo claro / impressão |

**Status semânticos** (`success` / `warning` / `danger` / cyan de execução) permanecem tokens funcionais e não substituem a marca.

## 4. Assets

```
assets/brand/
  vectors/   mark.svg, mark_dark.svg
  icons/     icon_16.png … icon_512.png
  lockups/   lockup_*_github.png, lockup_*_4K.png
  selos/     selo_*_512.png
```

PWA (Next.js): `apps/web/public/icon_192.png`, `icon_512.png`  
Manifest: `/icon_192.png`, `/icon_512.png`

## 5. Lockups

- **Escuro** (`lockup_escuro_*`): fundo `#0B0D0C` — header, README dark
- **Claro** (`lockup_claro_*`): fundo `#F5F3EE` — docs claras

## 6. Regras

- Não deformar o losango
- Não usar indigo legado (`#6366F1`) como accent de marca
- Não inventar geometria fora da grade 24×24
- SVG de referência: `assets/brand/vectors/mark.svg`
