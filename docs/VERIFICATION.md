# VERIFICATION.md — Plutão Verification Matrix & Criteria

**Last Updated:** 2026-09-14
**Status:** Multi-Layer Verification Operational (`Foundation` → `Runtime` → `Autonomia V1.1` → `DoD Gate` → `Production`)

This document tracks verified capabilities across all architectural layers of Project Plutão. Status transitions from **IMPLEMENTED** → **VERIFIED** only when real evidence (automated test green, production response, or documented mobile/e2e proof) exists.

---

## 1. Layer A — Foundation & Monorepo Infrastructure

- [x] **Install & Lockfile:** `npm install` completes cleanly; root `package-lock.json` committed.
- [x] **Monorepo Workspaces:** `apps/web`, `packages/domain`, `packages/db` resolve and transpile properly.
- [x] **Build & Typecheck:** `npm run build` and TypeScript check exit with code 0 across workspaces.
- [x] **Database Connection:** `GET /api/health` returns `database.ok: true` via Neon pooled connection (`DATABASE_URL`).
- [x] **Schema Alignment:** Baseline schema (`0000_baseline.sql` / `0001_executions.sql`) applied and aligned on production Neon PostgreSQL (São Paulo).

---

## 2. Layer B — Authentication & Data Isolation

- [x] **Auth Endpoints:** `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me` functional with secure session cookies.
- [x] **Password Hashing:** Password hashing with `scrypt` and salting implemented.
- [x] **User Isolation:** All mission, task, and execution queries strictly filtered by `userId` via ownership middleware (`getOwnedMission()`).

---

## 3. Layer C — Mission Engine & State Machine

- [x] **Lifecycle Transitions:** State transitions validated: `CREATED` → `UNDERSTANDING` → `PLANNING` → `EXECUTING` → `VERIFYING` → `COMPLETED` / `FAILED` / `BLOCKED` / `CANCELLED`.
- [x] **Mission Persistence:** `POST /api/missions` creates persistent missions with unique UUID `missionId`.
- [x] **Execution Persistence:** `executions` table tracks individual execution runs, current phase, and step progress.

---

## 4. Layer D — Durable Runtime & Checkpoints

- [x] **Checkpoint Persistence:** `saveCheckpoint` and `restoreCheckpoint` persist state snapshots into Neon DB.
- [x] **Step Memoization:** Completed `AgentStep`s are memoized so retries or page reloads resume from the last valid step without repeating side effects.
- [x] **Execution Recovery:** Interrupted executions can be retrieved and resumed via `GET /api/missions/:id/executions`.

---

## 5. Layer E — Agent Loop & Tool Dispatcher

- [x] **Multi-Turn Agent Loop:** `runAgentLoop` executes iterative model inference, tool call extraction, tool dispatch, and output reinjection.
- [x] **Iteration Guard:** Hard limit on maximum model turns (≤5) prevents infinite execution loops.
- [x] **Tool Dispatcher:** Tool Dispatcher validates tool parameters, checks authorization, and routes to appropriate tool handlers.

---

## 6. Layer F — Tools & Sandbox Environment

- [x] **Filesystem Tool V1:** `apps/web/src/lib/runtime/tools/filesystem.ts` supports `list`, `read`, `write`, `mkdir`, and `stat` within isolated sandbox paths.
- [x] **Path Traversal Protection:** Sanity checks block paths escaping designated target directory (`PATH_OUTSIDE_SANDBOX`).
- [x] **Note Tool:** Note tool creates and updates structured notes within mission context.

---

## 7. Layer G — Model Layer (Hybrid Cloud + Local)

- [x] **Cloud Groq Provider:** Integrates `openai/gpt-oss-120b` via Groq API. Verified in production.
- [x] **Local Transformers.js Provider:** `@huggingface/transformers` dynamic import running client-side local models (`LocalProvider`).
- [x] **WebGPU Acceleration:** `checkWebGPUSupport()` detects WebGPU availability with automatic fallback to CPU.
- [x] **Model Mode Selection:** `useModelMode` hook persists `auto` | `online` | `offline` in `localStorage` (`plutao_model_mode`).

---

## 8. Layer H — Autonomia V1.1 Execution

- [x] **Single-Click Execution:** **▶ Executar missão** in Cockpit UI triggers automated end-to-end mission loop (`runAutonomousMission.ts`).
- [x] **Automated Lifecycle Chain:** Transitions through `EXECUTING` → `runAgentLoop` → Model Steps → Runtime Complete → `VERIFYING` → `DoD Check` → `COMPLETED`.
- [x] **Production Evidence:** Mission `AUTO_V11` (`notes/auto-v11.txt`) executed and transitioned to `COMPLETED` without manual interventions.

---

## 9. Layer I — Verification Engine & Definition of Done (DoD)

- [x] **Deterministic DoD Checks:** `apps/web/src/lib/missions/dod.ts` evaluates exact deterministic criteria (e.g. file existence, path matching, size check).
- [x] **DoD Verification Gate:** `PATCH /api/missions/:id` blocks state transition to `COMPLETED` unless `/api/missions/:id/verify` passes or `force: true` is set.
- [x] **DoD UI Panel:** `MissionDoDPanel` component renders DoD status and verification results in Cockpit UI.

---

## 10. Layer J — Evidence Engine & Trace Logging

- [x] **Evidence Logging:** Tool outputs, model parameters, and step execution traces logged to `/api/missions/:id/evidence`.
- [x] **Evidence UI Panel:** `MissionEvidencePanel` renders structured audit logs and tool results in the mission detail view.

---

## 11. Layer K — Offline UI & Mobile Resilience

- [x] **Offline Status Detection:** Header indicator shows `Sem conexão` when network connectivity is lost.
- [x] **Offline Banner:** `OfflineBanner` renders warning notice while keeping Cockpit, timeline, and evidence readable.
- [x] **Graceful Error Handling:** Offline user actions display friendly error toasts (`Sem conexão: não foi possível...`) without application crashes or white screens.
- [x] **Mobile Verification:** Verified on Chrome Android Mobile under airplane mode (`docs/OFFLINE_TEST.md` and `docs/testes/2026-09-14-offline-mobile/`).

---

## 12. Layer L — Production Deployment

- [x] **Production URL:** Hosted live on Vercel (`https://plutao-os.vercel.app`).
- [x] **Database Hosting:** Neon Serverless PostgreSQL (São Paulo).
- [x] **Continuous Deployment:** Git push to `main` automatically triggers Vercel production build and deploy.

---

## 🚨 Pending / Unverified Capabilities (Roadmap)

- [ ] **Pending Intents / Sync Queue:** Local offline queue for sync operations created while offline (`NOT IMPLEMENTED`).
- [ ] **Service Worker Background Execution:** Long-running mission execution when PWA tab is completely closed (`NOT IMPLEMENTED`).
