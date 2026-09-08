# PROJECT_SPECIFICATION — Part 3 (sections 55–84)

Continuation of the authoritative Architecture Baseline v1.0.

---

# 55. HOOKS

Lifecycle hooks:

```text
SessionStart, SessionEnd, UserPromptSubmit,
BeforeMissionStart, BeforeTask, PreToolUse, PostToolUse,
PostToolUseFailure, PermissionDenied, AfterTask,
BeforeCompaction, AfterCompaction, BeforeCommit, AfterCommit,
BeforeDeploy, AfterDeploy, BeforeVerification, AfterVerification,
BeforeMissionComplete, Stop, SubagentStart, SubagentStop
```

Hooks may observe, validate, block, update state, require verification, or record evidence.

---

# 56. AUTONOMY LEVELS

```text
0 OBSERVE — read-only
1 ASSISTED — safe tools + approval
2 AUTONOMOUS CODING — coding sandbox + tests
3 MISSION AUTONOMY — Git/deploy within scope
4 FUTURE BROAD AUTONOMY — not V1
```

Security Ceiling always wins.

---

# 57. SETTINGS

Precedence: SYSTEM → MANAGED → USER → PROJECT → SESSION / TEMPORARY

Categories: General, Models, Agent, Memory, Tools, Connectors, Skills, Agents, MCP, Hooks, Security, Appearance, Voice, Automations, Projects, Widget, Data & Privacy, Advanced.

---

# 58. CONNECTORS

Connector != Tool. Contains authentication, scopes, capabilities, tools, rate limits, data policy, health. Credentials remain outside model context.

---

# 59. SKILLS

Skill = reusable expertise (Markdown, scripts, resources, examples). Skills load progressively. Skill != Workflow.

---

# 60. AUTOMATIONS

Trigger → Mission → Workflow → Execution → Verification → Run Result

Triggers: schedule, webhook, event, email, external connector event.

---

# 61. PROJECT INTELLIGENCE

On project initialization inspect language, framework, package manager, architecture, entry points, tests, build, deployment, env, database, API, Git, documentation, dependencies, risk areas. Persist a project map.

---

# 62. PROJECT CONTINUITY

When the user says “Continue the project”: LOAD PROJECT → READ SPEC → READ CURRENT STATE → READ DECISIONS → INSPECT REPOSITORY → CHECK GIT → CHECK ACTIVE MISSIONS → CONTINUE.

---

# 63. UI / PWA

Mobile-first PWA cockpit. Primary: Mission input, status, current action, what needs user, what finished/failed, evidence, timeline, artifacts, approvals, logs. Internal multi-agent complexity hidden by default. PWA is the cockpit, not the durable runtime.

---

# 64. MISSION TIMELINE

Events: mission.created, mission.planned, task.started, agent.spawned, tool.requested, approval.requested, tool.completed, task.completed, verification.*, correction.*, checkpoint.*, deployment.*, mission.completed.

---

# 65. FUTURE ANDROID

Native Android should reuse the same Agent Gateway/Core. No rewrite of the core should be required.

---

# 66. IMPLEMENTATION PHASES

Phase 1 — Foundation  
Phase 2 — Mission Core  
Phase 3 — Durable Runtime  
Phase 4 — Tool Plane  
Phase 5 — Model Plane  
Phase 6 — Context / Memory / Knowledge  
Phase 7 — Verification  
Phase 8 — Subagents / Workflows  
Phase 9 — Connectors / Automation  
Phase 10 — Production Hardening

---

# 67. V1 NON-GOALS

Do not initially build: unrestricted host access, privileged containers, unrestricted network, arbitrary secret exposure, multiple independent vector/graph DBs, automatic self-modifying production code, fully autonomous financial transactions, broad autonomous account management, native Android before core stable, ML-based routing before deterministic routing measured, GraphRAG everywhere.

---

# 68. ACCEPTANCE CRITERIA

V1 Mission Engine is not production-ready until it demonstrates Mission (create/persist/resume/cancel/recover), Agent (model step/tool/persist/recover), Tools (validate/authorize/execute/evidence), Security (deny unauthorized, secrets excluded, sandbox non-root, audit), Model (capability routing, fallback, health, token budget), Knowledge (ingest/parse/chunk/index/retrieve/provenance), Memory (candidate/validation/persist/stale/conflict), Verification (tests/evidence/independent), Continuity (close PWA, reopen, mission resumable).

---

# 69. OBSERVABILITY

Structured telemetry: request_id, mission_id, task_id, agent_id, step_id, tool_call_id, provider, model, runtime_execution_id, timestamp, duration, status, error_type, retry_count, token_usage, estimated_cost.

Never log secrets.

---

# 70. ERROR TAXONOMY

TRANSIENT, PERMANENT, AUTH, RATE_LIMIT, TIMEOUT, CONFLICT, VALIDATION, POLICY_DENIED, RESOURCE_BUSY, RESOURCE_LIMIT_EXCEEDED, PROVIDER_UNAVAILABLE, SANDBOX_FAILURE, UNKNOWN.

---

# 71. COST CONTROL

Budgets at ACCOUNT, AGENT, PROJECT, MISSION, TASK, AGENT STEP.

---

# 72. BASELINE DATA MODEL

Core entities: users, agents, projects, project_members, missions, tasks, task_dependencies, agent_runs, agent_steps, workflows, workflow_runs, workflow_steps, tools, tool_calls, permissions, approvals, connectors, connector_accounts, skills, automations, memory_items, knowledge_sources, knowledge_documents, knowledge_chunks, knowledge_entities, knowledge_relationships, embeddings, artifacts, evidence, checkpoints, execution_snapshots, audit_events, provider_configs, model_registry, model_usage, cost_records, verification_runs.

---

# 73. DOMAIN MODULES

```text
apps/web/
services/gateway, mission, agent, workflow, tools, security, knowledge, memory, models, verification/
packages/domain, contracts, config, observability, adapters/
```

---

# 74. API PRINCIPLES

Typed, authenticated, authorized, validated, idempotent where necessary, observable, documented. Never invent provider endpoints. Never expose secrets.

---

# 75. GIT PRINCIPLES

Before changes: git status, branch, diff, inspect uncommitted work. Atomic meaningful commits. Parallel coding agents should use worktrees.

---

# 76. DEPLOYMENT

Deployment is a mission/task: build → tests → verification → env validation → approval if required → deployment → health check → evidence → result.

---

# 77. REQUIRED DOCUMENTATION

PROJECT_SPECIFICATION.md, ARCHITECTURE.md, CURRENT_STATE.md, DECISIONS.md, SECURITY.md, DEVELOPMENT.md, DEPLOYMENT.md, TESTING.md.

---

# 78. CURRENT ARCHITECTURE

USER → PWA → AGENT GATEWAY → MISSION ENGINE → WORKFLOW CORE → DURABLE EXECUTION → AGENT RUNTIME → CONTEXT ENGINE + MODEL ROUTER → TOOL BROKER → POLICY/APPROVAL → SANDBOX → EVIDENCE → VERIFICATION → STATE.

---

# 79. OPEN DECISIONS

Exact frontend/backend framework, database hosting, durable runtime provider, model providers, embedding model, reranker, auth provider, sandbox implementation, deployment provider, vector scaling, graph DB, native Android timing, local model strategy — resolve through repository inspection, compatibility, testing, cost, security, and evidence.

---

# 80. CURRENT RESEARCH-BASED BASELINE

PWA + TypeScript backend + PostgreSQL + pgvector + hybrid retrieval + provider-agnostic Model Router + durable execution abstraction + Inngest as V1 candidate + sandboxed Tool Broker + Policy/Approval + Memory/Knowledge separation + Evidence/Verification.

Candidates, not permission to blindly install.

---

# 81. IMPLEMENTATION LOOP

inspect → understand → plan → implement → test → verify → record evidence → update CURRENT_STATE → update DECISIONS when final → commit → continue.

Ask user only when: approval required, materially new decision outside spec, credentials unavailable, destructive action exceeds authorization, ambiguity cannot be safely resolved.

---

# 82. INITIAL BUILD DEFINITION OF DONE

Core platform operational: repository inspected, architecture established, core domain, Mission/Task engines, durable execution behind adapter, Agent Runtime, Model Gateway/Router with ≥1 verified provider, Tool Broker, permission/approval foundations, sandbox foundation, PostgreSQL, Context Engine foundation, basic Memory/Knowledge, basic retrieval, verification pipeline, observability, tests passing, documentation updated, deployment verified if in mission.

---

# 83. FINAL ENGINEERING PRINCIPLE

Do not optimize for “make the demo work once.” Optimize for continuity, durability, recoverability, security, observability, verification, replaceability, evidence.

Target: USER → MISSION → UNDERSTAND → PLAN → EXECUTE → USE TOOLS → VERIFY → CORRECT → CONTINUE → COMPLETE.

---

# 84. INITIAL STATUS

```text
Architecture: DESIGNED
Research: SUBSTANTIALLY COMPLETED
Repository implementation: NOT YET VERIFIED
Production readiness: NOT YET VERIFIED
```

---

## RESEARCH BASIS

The architecture above incorporates the project's accumulated research on durable execution, model routing, context compilation, memory, hybrid retrieval, pgvector, sandboxing, tool governance, verification, and autonomous workflows.

Current research specifically confirms that Inngest provides checkpointed/retriable steps and persisted state, while pgvector supports HNSW/IVFFlat and hybrid search patterns. These are treated as evidence for architectural candidates, not as mandates to adopt them without repository inspection and testing.
