# Plutão

![Plutão OS](assets/brand/lockups/lockup_escuro_github.svg)

Personal Autonomous AI Operating System — mission-first cockpit.

**Repo:** `jadiel054/plutao-os`  
**Status:** Runtime + Agent Loop + Cockpit + Autonomia V1.1 → **VERIFIED em produção**
**Brand:** [docs/BRAND.md](docs/BRAND.md) (grade 24×24 · φ · Grafite/Platina)
**Production:** [https://plutao-os.vercel.app](https://plutao-os.vercel.app)

---

## What is Plutão?

Plutão is a personal autonomous AI operating system designed around a **mission-first** paradigm. Rather than treating chat as a ephemeral conversation, Plutão focuses on executing persistent missions with durable state, tool authorization, hybrid cloud/local inference, deterministic verification, and independent evidence collection.

---

## Stack

- **Frontend & App:** Next.js 15 (App Router) + PWA Shell
- **Monorepo Architecture:** TypeScript workspaces (`apps/web`, `packages/domain`, `packages/db`)
- **Database & ORM:** PostgreSQL on Neon (São Paulo) + Drizzle ORM
- **Inference Layer:** Hybrid Model Plane (Cloud Groq `openai/gpt-oss-120b` + Client-Side `@huggingface/transformers` WebGPU / CPU)
- **UI & Tokens:** Tailwind CSS (dark-first, BRAND-001 aligned)

---

## Key Operational Capabilities (VERIFIED)

- ⚡ **Autonomia V1.1:** Single-click mission execution (**▶ Executar missão**) running the full end-to-end cycle from `EXECUTING` through `Agent Loop` to `VERIFYING` and `COMPLETED`.
- 🔄 **Durable Runtime & Checkpoints:** State persistence and step memoization, allowing executions to recover state and resume smoothly across reloads.
- 🛠️ **Tool Dispatcher & Filesystem Tool V1:** Sandboxed filesystem operations (`list`, `read`, `write`, `mkdir`, `stat`) with path traversal guards.
- 🤖 **Hybrid Model Plane:** Cloud inference via Groq (`openai/gpt-oss-120b`) and offline local inference via `@huggingface/transformers` (WebGPU with CPU fallback).
- 🛡️ **DoD Verification Gate:** Gate preventing missions from completing without passing deterministic Definition of Done (DoD) checks.
- 📊 **Evidence Engine:** Audit logs and structured execution traces attached to every mission step.
- 📱 **PWA & Offline Resilience:** Mobile-first cockpit with Service Worker, `OfflineBanner`, network status indicator, and controlled error handling.

---

## Architecture Summary

```text
USER / PWA COCKPIT
       ↓
MISSION APIs & STATE (Neon DB)
       ↓
DURABLE RUNTIME & CHECKPOINTS
       ↓
AGENT LOOP (runAgentLoop)
       ↓
TOOL DISPATCHER (Filesystem V1, Note)
       ↓
MODEL LAYER (Cloud Groq + Local WebGPU/CPU)
       ↓
EVIDENCE & DEFINITION OF DONE (DoD Gate)
```

---

## Quick Start

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for full local environment setup.

```bash
npm install
cp .env.example .env.local   # fill Neon URLs
npm run dev
```

Health check: `GET http://localhost:3000/api/health`

---

## Current Roadmap & Limitations

- ⏳ **Pending Intents / Offline Sync Queue:** Queueing offline mission creations and actions for automatic reconciliation upon network restoration (planned).
- ⏳ **Service Worker Background Execution:** Continuous mission execution while PWA browser tab is completely closed (planned).

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) | **Source of Truth** for live system state & status matrix |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Operational architecture & component interactions |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | Multi-layer verification matrix & criteria |
| [docs/PROJECT_SPECIFICATION.md](docs/PROJECT_SPECIFICATION.md) | Master Architecture Baseline v1.0 (Target Spec) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log |
| [docs/BRAND.md](docs/BRAND.md) | Brand geometry & color system |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | UI design tokens |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local workflow & instructions |
| [docs/OFFLINE_TEST.md](docs/OFFLINE_TEST.md) | Offline testing protocol & mobile results |
| [docs/PLATAFORMA_VISAO.md](docs/PLATAFORMA_VISAO.md) | Long-term product strategy & vision |

---

## Important

The Neon PostgreSQL schema is **already applied** in production. Do not run baseline migrations against the live database without explicit approval.
