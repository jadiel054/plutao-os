# ARCHITECTURE.md — Plutão

**Status:** IMPLEMENTED / VERIFIED in Production (Runtime Engine, Agent Loop, Tool Dispatcher, Model Plane, DoD Engine)
**Aligned with:** `docs/PROJECT_SPECIFICATION.md` Architecture Baseline v1.0 & `docs/CURRENT_STATE.md`

---

## 🏛️ Operational Architecture (Current State)

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               USER / PWA COCKPIT                                │
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
│       ONLINE MODEL ROUTER       │         │      OFFLINE LOCAL ROUTER       │
│  (Groq: openai/gpt-oss-120b)    │         │ (WebGPU / @huggingface/transformers)│
└────────────────┬────────────────┘         └────────────────┬────────────────┘
                 │                                           │
                 └─────────────────────┬─────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            TOOL DISPATCHER & SANDBOX                            │
│     - Tool Dispatcher & Execution Guard                                         │
│     - Filesystem Tool V1 (list, read, write, mkdir, stat)                       │
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

## 🏗️ Repository Structure

```text
plutao-os/
├── apps/
│   └── web/                 # Next.js 15 PWA cockpit, API routes, runtime services
│       ├── src/app/         # App router (pages, auth, cockpit, API routes)
│       ├── src/components/  # UI components (Timeline, EvidencePanel, DoDPanel, OfflineBanner)
│       ├── src/hooks/       # Client hooks (useModelMode, useModelManager)
│       └── src/lib/         # Server/runtime core (runtime, missions, auth, db)
├── packages/
│   ├── domain/              # Shared TypeScript domain models, agent loop, local provider, registry
│   └── db/                  # Drizzle ORM schema, Neon client, versioned migrations
├── services/                # Reserved for future microservices extraction
├── docs/                    # Living system documentation
├── README.md                # Project overview and public entry point
└── package.json             # npm workspaces root
```

---

## 🧩 Implemented & Verified Capabilities

| Component | Location | Role & Implementation Status |
|-----------|----------|------------------------------|
| **PWA Shell & Cockpit** | `apps/web/src/app/(app)/cockpit` | Mobile-first UI, Service Worker, mission execution trigger, DoD panel, evidence timeline. (**VERIFIED**) |
| **Authentication & Isolation** | `apps/web/src/app/api/auth`, `ownership.ts` | Password hashing (scrypt), session tokens, route protection, strict `userId` data isolation. (**VERIFIED**) |
| **Mission Core & State** | `packages/db/src/schema.ts`, `apps/web/src/app/api/missions` | State transitions (`CREATED` → `EXECUTING` → `VERIFYING` → `COMPLETED`/`FAILED`). (**VERIFIED**) |
| **Durable Runtime & Checkpoints** | `apps/web/src/lib/runtime/checkpoint.ts` | State persistence, step memoization, and mission state recovery across sessions. (**VERIFIED**) |
| **Agent Loop** | `packages/domain/src/runtime/agentLoop.ts`, `apps/web/src/lib/runtime/agent-loop.ts` | Multi-turn reasoning, tool call interpretation, result reinjection, iteration limiting. (**VERIFIED**) |
| **Tool Dispatcher & Tools** | `apps/web/src/lib/runtime/tools/` | Tool Dispatcher executing `Filesystem Tool V1` (list, read, write, mkdir, stat) and `Note` tool. (**VERIFIED**) |
| **Model Layer (Hybrid)** | `packages/domain/src/models/registry.ts`, `packages/domain/src/runtime/providers/` | Cloud Groq (`openai/gpt-oss-120b`) + Local Transformers.js (`WebGPU` / `CPU` fallback). (**VERIFIED**) |
| **Evidence Engine** | `apps/web/src/app/api/missions/[id]/evidence` | Structured execution traces, tool outputs, and audit logs stored in `evidence` column. (**VERIFIED**) |
| **Verification & DoD Gate** | `apps/web/src/lib/missions/dod.ts`, `/api/missions/[id]/verify` | Deterministic verification of outputs against Definition of Done before transitioning to `COMPLETED`. (**VERIFIED**) |
| **Autonomia V1.1** | `apps/web/src/lib/cockpit/runAutonomousMission.ts` | Single-click end-to-end execution: EXECUTING → Agent Loop → Runtime → VERIFYING → DoD Check → COMPLETED. (**VERIFIED**) |
| **Offline UI & Resilience** | `apps/web/src/components/OfflineBanner.tsx` | Connectivity status detection, OfflineBanner, graceful network error toasts without application crash. (**VERIFIED**) |

---

## 📐 Planned Architecture Extensions (Not Yet Implemented)

- **External Durable Execution Adapters (Inngest / BullMQ):** External queue-based background workers (currently handled in-process via Next.js runtime with DB checkpoints).
- **Pending Intents Sync Queue:** Local IndexedDB queue for queuing actions created while completely offline for automatic server reconciliation upon re-establishing network connection.
- **Background Execution via Service Worker:** Background execution when the PWA browser tab is completely closed by the user.

---

## 💾 Data Store

- **Neon PostgreSQL 17** (São Paulo region), database `plutao`.
- App uses pooled `DATABASE_URL` via Drizzle ORM client (`packages/db/src/client.ts`).
- Migrations managed via Drizzle Kit (`packages/db/drizzle/`).
