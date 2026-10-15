# ARCHITECTURE.md — Plutão

**Status:** IMPLEMENTED / VERIFIED in Production (Runtime Engine, Agent Loop, Tool Dispatcher, Model Plane, DoD Engine)
**Aligned with:** `docs/PROJECT_SPECIFICATION.md` Architecture Baseline v1.0 & `docs/CURRENT_STATE.md`
**Docs sync:** 2026-10-15 (GGUF on-device no APK)

---

## Operational Architecture (Current State)

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    USER / PWA COCKPIT / APK (Capacitor)                         │
│           (Cockpit UI, Timeline, Evidence Panel, DoD Panel, PWA Shell)          │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ Async Requests / JSON APIs
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               MISSION ENGINE & APIs                             │
│     Routes: /api/missions/*, /api/executions/*, /api/tasks/*, /api/auth/*     │
│     State Machine: CREATED → EXECUTING → VERIFYING → COMPLETED/FAILED/BLOCKED  │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        DURABLE RUNTIME & CHECKPOINTS                            │
│     - Checkpoint Persistence (saveCheckpoint / restoreCheckpoint to Neon DB)    │
│     - Step Memoization & Execution State Recovery                               │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   AGENT LOOP                                    │
│     - Iterative model calling & tool reinjection (runAgentLoop)                 │
│     - Context construction & step execution tracing                             │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                 ┌─────────────────────┴─────────────────────┐
                 ▼                                           ▼
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│       ONLINE MODEL ROUTER       │         │   LOCAL (APK GGUF / llama.cpp) │
│     (Cloud model provider)      │         │  (+ WebGPU experimental no web)│
└────────────────┬────────────────┘         └────────────────┬────────────────┘
                 │                                           │
                 └─────────────────────┬─────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            TOOL DISPATCHER & SANDBOX                            │
│     - Tool Dispatcher & Execution Guard                                         │
│     - Filesystem Tool V1 (list, read, write, mkdir, stat)                       │
│     - Connector tools (GitHub, Vercel, …) with write gate                       │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      EVIDENCE ENGINE & VERIFICATION LOOP                        │
│     - Evidence Logging (/api/missions/:id/evidence)                             │
│     - Definition of Done (DoD) Evaluation Engine & Gate (/api/missions/:id/verify)│
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```text
plutao-os/
├── apps/
│   ├── web/                 # Next.js 15 PWA cockpit, API routes, runtime services
│   │   ├── src/app/         # App router (pages, auth, cockpit, API routes)
│   │   ├── src/components/  # UI components (Timeline, EvidencePanel, DoDPanel, OfflineBanner)
│   │   ├── src/hooks/       # Client hooks (useModelMode, useModelManager)
│   │   └── src/lib/         # Server/runtime core (runtime, missions, auth, db, models)
│   └── android/             # Capacitor shell, LocalModelPlugin, NDK llama.cpp (GGUF)
├── packages/
│   ├── domain/              # Shared TypeScript domain models, agent loop, local provider, registry
│   └── db/                  # Drizzle ORM schema, Neon client, versioned migrations
├── services/                # Reserved for future microservices extraction
├── docs/                    # Living system documentation
├── README.md                # Project overview and public entry point
└── package.json             # npm workspaces root
```

---

## Implemented & Verified Capabilities

| Component | Location | Role & Implementation Status |
|-----------|----------|------------------------------|
| **PWA Shell & Cockpit** | `apps/web/src/app/(app)/cockpit` | Mobile-first UI, Service Worker, mission execution trigger, DoD panel, evidence timeline. (**VERIFIED**) |
| **Authentication & Isolation** | `apps/web/src/app/api/auth`, `ownership.ts` | Password hashing (scrypt), session tokens, route protection, strict `userId` data isolation. (**VERIFIED**) |
| **Mission Core & State** | `packages/db/src/schema.ts`, `apps/web/src/app/api/missions` | State transitions (`CREATED` → `EXECUTING` → `VERIFYING` → `COMPLETED`/`FAILED`). (**VERIFIED**) |
| **Durable Runtime & Checkpoints** | `apps/web/src/lib/runtime/checkpoint.ts` | State persistence, step memoization, and mission state recovery across sessions. (**VERIFIED**) |
| **Agent Loop** | `packages/domain/src/runtime/agentLoop.ts`, `apps/web/src/lib/runtime/agent-loop.ts` | Multi-turn reasoning, tool call interpretation, result reinjection, iteration limiting. (**VERIFIED**) |
| **Tool Dispatcher & Tools** | `apps/web/src/lib/runtime/tools/` | Tool Dispatcher executing filesystem tools and connector capabilities with write gate. (**VERIFIED**) |
| **Model Layer (Hybrid)** | cloud providers + `apps/android` GGUF | Provedor remoto; no APK, GGUF via llama.cpp (ChatML, stream throttled). WebGPU no browser permanece experimental. (**IMPLEMENTED**) |
| **Evidence Engine** | `apps/web/src/app/api/missions/[id]/evidence` | Structured execution traces, tool outputs, and audit logs stored in `evidence` column. (**VERIFIED**) |
| **Verification & DoD Gate** | `apps/web/src/lib/missions/dod.ts`, `/api/missions/[id]/verify` | Deterministic verification of outputs against Definition of Done before transitioning to `COMPLETED`. (**VERIFIED**) |
| **Offline UI & Resilience** | `apps/web/src/components/OfflineBanner.tsx` | Connectivity status detection, OfflineBanner, graceful network error toasts without application crash. (**VERIFIED**) |
| **Pending Intents & Reconciliation** | `packages/domain/src/intents/types.ts`, `apps/web/src/lib/offline/` | Client-side IndexedDB persistent queue, strict state machine, user isolation, online reconciler. (**VERIFIED**) |

---

## Planned Architecture Extensions (Not Yet Implemented)

- **External Durable Execution Adapters (Inngest / BullMQ):** External queue-based background workers (currently handled in-process via Next.js runtime with DB checkpoints / optional queue wake-ups).
- **Background Execution via Service Worker:** Background execution when the PWA browser tab is completely closed by the user.
- **Play Store / production signed APK distribution.**

---

## Data Store

- **Neon PostgreSQL** (São Paulo region), database `plutao`.
- App uses pooled `DATABASE_URL` via Drizzle ORM client (`packages/db/src/client.ts`).
- Migrations managed via Drizzle Kit (`packages/db/drizzle/`).
