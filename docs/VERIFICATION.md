# VERIFICATION.md — Plutão Verification Matrix & Criteria

**Last Updated:** 2026-10-08
**Status:** Multi-Layer Verification Operational (`Foundation` → `Runtime` → `Autonomia V1.1` → `DoD Gate` → `Production`)

This document tracks verified capabilities across all architectural layers of Project Plutão. Status transitions from **IMPLEMENTED** → **VERIFIED** only when real evidence (automated test green, production response, or documented mobile/e2e proof) exists.

The latest user-flow production smoke test is documented in [`docs/testes/2026-09-17-production-smoke/relatorio-production-smoke.md`](testes/2026-09-17-production-smoke/relatorio-production-smoke.md). It confirms the authentication, mission, chat, settings, persistence and DoD paths tested on 17/09/2026, and records the capabilities that remain unverified.

For the Mission Graph V2 rollout, the minimum authenticated Cockpit E2E passed in run [#37853714597](https://github.com/jadiel054/plutao-os/actions/runs/37853714597) (`1 passed`, 8.3s), but it does not cover multi-node execution. Package B run [#37857489190](https://github.com/jadiel054/plutao-os/actions/runs/37857489190) validated production intake/idempotency and graph/specialist assignment APIs, then timed out waiting for the worker. A read-only Neon check found the test job/execution cancelled with no node checkpoint; a later worker run processed the already-cancelled job. Therefore serial continuation, DoD/evidence per node, Write Gate decisions, and specialist model quality remain **unverified**. See [`the status report`](testes/2026-10-08-smoke-piloto-pendentes/relatorio-smoke-piloto.md); do not infer these capabilities from a green workflow or a health probe.

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
- [x] **Durable Enqueue Boundary:** `POST /api/missions/:id/autonomous-run` only creates `execution/job` in `PENDING` and returns `202`; it never runs the agent loop synchronously.
- [x] **Worker Authority:** `/api/cron/runtime-worker` claims leases atomically, resumes the claimed execution, and derives job terminal state from persisted execution state.
- [x] **Failure Consistency:** `execution.FAILED` cannot produce `runtime_jobs.SUCCEEDED`; retry exhaustion produces `FAILED`, and user stop produces explicit `CANCELLED`.
- [x] **Divergence Reconciliation:** stale terminal job/execution mismatches are repaired and emitted as `JOB_EXECUTION_STATE_DIVERGENCE` telemetry.

---

## 5. Layer E — Agent Loop & Tool Dispatcher

- [x] **Multi-Turn Agent Loop:** `runAgentLoop` executes iterative model inference, tool call extraction, tool dispatch, and output reinjection.
- [x] **Iteration Guard:** Hard limit on maximum model turns per call (`MAX_ITERATIONS = 20`).
- [x] **Accumulated Budget (H6):** `MAX_TOTAL_ITERATIONS = 60` por `execution`, persistido em
      `CheckpointPayload.iterationsUsed` e somado entre retomadas — impede loop indefinido entre requests.
- [x] **Wall-clock Budget (H6):** `MAX_LOOP_DURATION_MS = 240_000` verificado a cada iteração.
- [x] **No-progress Detection (H6):** assinatura `tool::input` repetida → `REPEATED_TOOL_CALL`;
      output idêntico consecutivo → `NO_PROGRESS`.
- [x] **Tool Dispatcher:** Tool Dispatcher validates tool parameters, checks authorization, and routes to appropriate tool handlers.
- [x] **Capability Registry (H9):** toda tool interna passa por `evaluateInternalTool` (fail-closed);
      toda capability de conector passa por `capabilityBlockReason` antes do HTTP.

---

## 6. Layer F — Tools & Sandbox Environment

- [x] **Filesystem Tool V1:** `apps/web/src/lib/runtime/tools/filesystem.ts` supports `list`, `read`, `write`, `mkdir`, and `stat` within isolated sandbox paths.
- [x] **Path Traversal Protection:** Sanity checks block paths escaping designated target directory (`PATH_OUTSIDE_SANDBOX`).
- [x] **Tenant Isolation (H8):** namespace de sandbox é sempre `userId__executionId`; não existe mais
      namespace `default` compartilhado. Resolução de caminho não muta estado global.
- [x] **Symlink Escape Protection (H8):** o ancestral existente mais próximo é resolvido por
      `realpath` e validado contra a raiz, inclusive para arquivos ainda inexistentes.
- [x] **Note Tool:** Note tool creates and updates structured notes within mission context.

---

## 7. Layer G — Model Layer (Hybrid Cloud + Local)

- [x] **Provedor de modelo na nuvem:** Integra um modelo remoto pela API configurada. Verificado em produção.
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
- [x] **DoD Verification Gate:** `PATCH /api/missions/:id` blocks state transition to `COMPLETED` unless `/api/missions/:id/verify` passes; `force=true` is ignored/rejected and a failed or inconclusive verification cannot be bypassed.
- [x] **DoD UI Panel:** `MissionDoDPanel` component renders DoD status and verification results in Cockpit UI.

---

## 10. Layer J — Evidence Records & Trace Logging

- [x] **Evidence Records:** Tool outputs, model parameters, and step execution traces can be logged to `/api/missions/:id/evidence`.
- [x] **Evidence UI Panel:** `MissionEvidencePanel` renders structured audit logs and tool results in the mission detail view.

> **Escopo atual:** os registros e o painel existem, mas não constituem ainda uma Evidence Engine independente por classe de evidência. A missão de produção executada em 17/09/2026 registrou um `model_step`; o DoD bloqueou a conclusão porque não havia `tool_result`.

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

## 13. Layer M — Security Hardening (2026-10-07)

- [x] **Write Gate Server-side (H1/H2):** escrita exige `_gateId` de gate do próprio usuário, com
      status `approved`, `payload_hash` conferido e consumo atômico de uso único. `_gateApproved` foi removido.
- [x] **Central Secret Sanitizer (H3):** trace, evidência, audit, erro de cliente e título de conversa
      passam por `lib/security/sanitize.ts`.
- [x] **Export HTML Sanitized (H4):** allowlist de tags/atributos; `<script>`, `on*` e `javascript:` neutralizados.
- [x] **Supabase Filter Validation (H4):** filtros estruturados, operadores em allowlist, parâmetros
      reservados (`select`, `limit`, `order`, `or`, `and`, …) recusados.
- [x] **MCP Rate Limit Coverage (H5):** 30 calls/60s por grant em todas as tools.
- [x] **Fail-closed Capabilities (H7/H9):** capability ausente, desabilitada ou sem controle
      implementado é recusada; `assertRegistryCoverage()` protege registro × manifestos.
- [x] **Agent Identity Applied (H10):** perfil de Configurações > Agente (`name`, `identity`,
      `personality`) alimenta o system prompt do chat **e** do MCP; default idêntico a `NIX_IDENTITY`.
- [x] **Documentation Drift Guard (H9):** `docs/CAPABILITIES.md` é gerado do registro e verificado em teste.
- [x] **Durable Runtime Error Taxonomy:** provider failures are stored as safe codes (`MODEL_RATE_LIMITED`, `MODEL_UNAUTHORIZED`, `MODEL_PROVIDER_UNAVAILABLE`, etc.) with controlled provider/model/retryable metadata; raw provider bodies are not persisted in mission evidence.
- [x] **Evidence:** 329 testes verdes, `tsc --noEmit` limpo, migration `0020` aplicada em produção.
      Detalhamento em [`docs/HARDENING_2026-10.md`](HARDENING_2026-10.md).

---

## 🚨 Pending / Unverified Capabilities (Roadmap)

- [ ] **Pending Intents / Sync Queue:** Implemented in the current code path, but not reverified in the 17/09/2026 production smoke test. A new network-loss test is required before marking the end-to-end behavior as VERIFIED.
- [ ] **Service Worker Background Execution:** Long-running mission execution when PWA tab is completely closed (`NOT IMPLEMENTED`).

## 14. Mission Graph V2 — implementação local

- [x] **Intake comum:** Chat, Cockpit e reconciliação offline usam `/api/missions`, com autenticação, ownership de conversa, origem e idempotency key; testes de rota cobrem replay e conflito.
- [x] **Grafo persistido:** missions novas recebem grafo V2 unitário; planos são validados e adaptados a topologia serial antes de enqueue.
- [x] **Scheduler serial:** uma invocation processa no máximo um nó, valida dependências/checkpoint e retoma a mesma execution/job por continuation.
- [x] **Evidence por nó:** DoD lê apenas evidence da mesma execution/nó; solicitações `GATE_PENDING` são excluídas como prova de efeito.
- [x] **Espera humana:** Write Gate persiste executionId, pausa o job em `WAITING_APPROVAL` e o libera após a decisão, preservando o gate server-side.
- [x] **Schema de produção:** migrations 0025/0026 aplicadas em `main`; consulta read-only confirmou campos, tipos, nullable/default, FK de conversa e índice.
- [ ] **Smoke de produção:** executar após deploy do código: missão multi-nó autenticada, refresh/retomada no PWA/APK e gate pendente/aprovação/rejeição.
- [x] **Computador (local):** Computador e MissionExecutionView exibem topologia, dependências, status de nó, tentativas e espera de aprovação. Validação visual com dados reais após as migrations permanece pendente; eventos do chat continuam sendo uma projeção separada.
- [x] **Perfis especialistas (local):** `software_engineer` e `teaching_assistant`, seleção pré-alinhamento, prompt por papel e allowlist aplicada no dispatcher; typecheck e testes de política/rota/prompt.
- [ ] **Paralelismo:** execução concorrente, isolamento entre nós e testes de corrida seguem desativados/futuros.

### Production evidence update — 2026-10-08

- [x] **Intake replay/conflict:** run #37857489190 observed exact idempotent replay and HTTP 409 for a different payload after PR #145 was deployed.
- [x] **Authenticated ownership boundary (partial):** owner-scoped list contained the synthetic mission and anonymous GET returned 401. Cross-account denial was not tested.
- [x] **Specialist assignment API/fail-closed (not model pilot):** incompatible capability and unknown profile returned 422; both profiles were assigned before alignment; graph remained immutable after alignment.
- [ ] **Serial worker execution/continuation:** run #37857489190 enqueued the execution/job but timed out after 34m12s. Persisted job/execution were later observed `CANCELLED`, with no active node or node states. The scheduled worker workflow had no invocation during the test window; run #37866058588 later reconciled the cancelled job only.
- [ ] **Write Gate approval/rejection and same-job resume:** not run; no external write was attempted.
- [ ] **Specialist model quality/latency/failure metrics:** not measured; no model step ran.
- [ ] **Worker cadence:** the workflow is active and declares `*/5 * * * *`, but the observed gap blocks safe serial validation. Do not manually dispatch the global worker until jobs can be isolated from other users.
