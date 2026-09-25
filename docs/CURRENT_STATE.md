# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-25 (voz Kokoro on-device IMPLEMENTED — smoke pendente)

Este documento registra o estado observado no repositório e em produção.
Capacidade só é **VERIFICADA** with evidência de uso real (não só código no `main`).

---

## Matriz

| Área | Status | Evidência / observação |
|------|--------|------------------------|
| Navegação e auth (email/senha) | **VERIFICADO** | Smoke produção. |
| Modo Convidado (Guest Mode) | **VERIFICADO** (2026-09-25) | Landing + `POST /api/auth/guest` + limits. Fix auto-create PR #56. Smoke AC3/AC4: pill sobrevive a refresh; LimitModal e cadastro OK. |
| Guest → conta: transcript chat (BUG-03) | **TORNIQUETE client** | Transcript só em `localStorage` por e-mail. Torniquete client. **Persistência server agendada.** CR4: não deletar user guest na conversão. |
| Write gate (GitHub write) | **VERIFICADO** (2026-09-25) | GATE_PENDING → aprovação → repo `plutao-smoke-gate`. Feedback no chat pendente. |
| **Voz (Kokoro on-device)** | **IMPLEMENTED** | `kokoro-js@1.2.1`; modelo HF runtime `onnx-community/Kokoro-82M-v1.0-ONNX`; aba Configurações → Voz; MessageActions. Preferências `users.preferences` (0015). **Smoke pendente.** pt-BR: `speechSynthesis` (sem pack pt no kokoro-js oficial). |
| B1. Login social (Google/GitHub) + Magic Link | **IMPLEMENTED** | Código + migrations 0007. |
| Mission Workspace + auto-plan + stop | **IMPLEMENTED / parcial VERIFICADO** | Plano, gate, CANCELLED. |
| Motion (sem confete) | **IMPLEMENTED** | DESIGN_SYSTEM. |
| Tools note / filesystem | **IMPLEMENTED** | Dispatcher + evidência. |
| Chat Núcleo + system prompt | **VERIFICADO** | Respostas reais em produção. |
| Chat — awareness de conectores | **VERIFICADO** | Status + capabilities no prompt. |
| Chat — tools GitHub | **VERIFICADO** | OAuth real. |
| Chat — tools Vercel | **VERIFICADO** | OAuth real. |
| Chat — FollowUpChips / fila / card conectar | **IMPLEMENTED** | — |
| Conectores UI (Sheet + Configurações) | **IMPLEMENTED** | Estados, gerenciar, catálogo. |
| GitHub / Vercel OAuth | **VERIFICADO** | Produção. |
| Neon / Stripe manifests | **IMPLEMENTED** | Smoke OAuth token pendente. |
| MCP personalizado | **IMPLEMENTED** | RFC 8414/9728. |
| Model resolve | **IMPLEMENTED** | default xAI grok-4.6. |
| Navigation `/planos` | **VERIFICADO** | R$19 / 29 / 39. |
| Billing Stripe | **IMPLEMENTED** | AC1–AC6 TEST 2026-09-25; LIVE pendente. |
| B2. Ações por conversa | **IMPLEMENTED** | pin/share; 0008 VERIFICADA. |
| `/ajuda` + `/legal/*` | **IMPLEMENTED** | Bot pendente. |
| Migrations 0000–0012 + **0015** no repo | **IMPLEMENTED** | 0015 preferences — SQL manual Neon. |
| Migrations Neon produção | **VERIFICADO** (até 0010) | 0011/0012/0015 aplicar se pendente. |
| Durable execution | **DESIGNED** | Fora V1. |
| Identidade “Cockpit” | **PROVISÓRIA** | — |
| PWA / APK | **PLANEJADO** | Após V1 web. |

---

## Operação pendente (voz)

```sql
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;
```

- Deploy com `kokoro-js` instalado
- Smoke AC1–AC5 em produção antes de marcar VERIFICADO

Guia conectores: **`docs/CONECTORES_M5.md`**.
