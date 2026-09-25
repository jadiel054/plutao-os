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
| Guest → conta: transcript chat (BUG-03) | **TORNIQUETE client** | Causa raiz: transcript só em `localStorage` por e-mail. **Correção estrutural agendada.** |
| Write gate (GitHub write) | **VERIFICADO** (2026-09-25) | GATE_PENDING → aprovação → repo smoke. Feedback no chat pendente. |
| **Voz (Kokoro on-device)** | **IMPLEMENTED** | `kokoro-js@1.2.1` + modelo HF runtime `onnx-community/Kokoro-82M-v1.0-ONNX`. Aba Configurações → Voz; MessageActions → ouvir. Preferências em `users.preferences` (0015). **Smoke pendente** (AC1–AC5). pt-BR: fallback `speechSynthesis` (sem pack pt no kokoro-js oficial). |
| B1. Login social (Google/GitHub) + Magic Link | **IMPLEMENTED** | Código + migrations 0007. |
| Mission Workspace + auto-plan + stop | **IMPLEMENTED / parcial VERIFICADO** | Plano, gate, CANCELLED. |
| Chat Núcleo + system prompt | **VERIFICADO** | Respostas reais em produção. |
| Chat — tools GitHub / Vercel | **VERIFICADO** | OAuth real. |
| Conectores UI | **IMPLEMENTED** | Estados, gerenciar, catálogo. |
| Billing Stripe (checkout/webhook) | **IMPLEMENTED** | AC1–AC6 TEST 2026-09-25; LIVE pendente. |
| Migrations 0000–0012 + **0015** no repo | **IMPLEMENTED** | 0015_user_preferences.sql (aplicar SQL manual no Neon). |
| Migrations no Neon produção | **VERIFICADO** (até 0010) | 0011/0012/0015: SQL manual se pendente. |
| Durable execution (Inngest etc.) | **DESIGNED** | Fora V1. |
| Identidade “Cockpit” | **PROVISÓRIA** | Revisar pós-estabilização. |

---

## Checklist V1 (extra)

- [ ] Neon: `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb NOT NULL;` (0015)
- [ ] `npm i` / install `kokoro-js` no deploy
- [ ] Smoke voz AC1–AC5 em produção

Guia conectores: **`docs/CONECTORES_M5.md`**.
