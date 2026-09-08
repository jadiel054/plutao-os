# PROJECT_SPECIFICATION.md

## Personal Autonomous AI Operating System
### Master Specification — Architecture Baseline v1.0

**Status:** DESIGNED / PRE-IMPLEMENTATION

> This document is the authoritative implementation specification for the project repository. The implementing agent must read it completely before modifying the repository.

**Complete specification on GitHub (split due to transport size limits):**

| File | Content |
|------|--------|
| [PROJECT_SPECIFICATION.md](./PROJECT_SPECIFICATION.md) | Sections **1–28** (this file) |
| [PROJECT_SPECIFICATION-part2.md](./PROJECT_SPECIFICATION-part2.md) | Sections **29–54** |
| [PROJECT_SPECIFICATION-part3.md](./PROJECT_SPECIFICATION-part3.md) | Sections **55–84** + Research Basis |

The single-file complete version (~37KB) also lives in the project sandbox and original conversation attachment.

---

# 1. CRITICAL IMPLEMENTATION CONTRACT

Before creating, modifying, deleting, refactoring, deploying, or replacing anything:

1. Read this entire document.
2. Inspect the existing repository, Git state, branches, commits, manifests, configuration, tests, deployment configuration, environment references, and existing documentation.
3. Determine what is IMPLEMENTED, VERIFIED, PARTIALLY IMPLEMENTED, or MISSING.
4. Do not recreate functionality that already works.
5. Do not replace working infrastructure merely because another technology is preferred.
6. Do not invent endpoints, credentials, environment variables, integrations, or external services.
7. Do not mark work complete without evidence.
8. Preserve working behavior unless a specification requirement explicitly requires change.
9. Keep documentation and repository state synchronized.
10. Distinguish FACT, INFERENCE, RECOMMENDATION, and DECISION.
11. Track status as DESIGNED, IMPLEMENTED, VERIFIED, or PRODUCTION-READY.

---

# 2. PRODUCT VISION

Build a personal autonomous AI operating system in which the user gives a mission and the system can:

- understand the objective;
- inspect relevant context;
- plan and decompose work;
- select appropriate models;
- use tools safely;
- spawn specialist subagents;
- execute long-running work durably;
- inspect and modify repositories/files;
- run tests;
- verify results;
- recover from failures;
- request approval only when policy requires it;
- create commits/deployments within authorized scope;
- collect evidence;
- continue after the UI closes;
- resume interrupted missions;
- report a verified result.

The user should experience one coherent primary agent. Multi-agent execution is an internal mechanism, not the primary UX.

Core principle:

**User gives mission → system understands → plans → executes → verifies → corrects → deploys when authorized → reports evidence.**

---

# 3. PRODUCT PRINCIPLES

## 3.1 Mission-first
Mission is the primary work object. Chat is an interface, not the source of truth.

## 3.2 Continuity
Closing a chat or PWA must not terminate durable execution. Context compaction must not lose mission state.

## 3.3 Goal != Plan
Goal is what must be achieved. Plan is the current strategy and may change.

## 3.4 Verification
Agent claims are not evidence. Completion requires independent verification.

## 3.5 Security
Security is an explicit subsystem.

## 3.6 Runtime independence
Domain logic must not be coupled directly to a durable runtime vendor, model provider, vector database, or connector.

## 3.7 Evidence and provenance
Important results and claims must be traceable to evidence.

## 3.8 Progressive complexity
Do not add infrastructure merely because it exists. Add complexity when requirements or measured evidence justify it.

---

*(Sections 4–28 continue in this file as previously pushed. Full continuous reading order: this file → part2 → part3.)*

For the complete uninterrupted text of all 84 sections, use the sandbox file `docs/PROJECT_SPECIFICATION.md` or the original attachment in the project conversation.
