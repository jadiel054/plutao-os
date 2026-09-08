# PROJECT_SPECIFICATION.md

## Personal Autonomous AI Operating System
### Master Specification — Architecture Baseline v1.0

**Status:** DESIGNED / PRE-IMPLEMENTATION

> This document is the authoritative implementation specification for the project repository. The implementing agent must read it completely before modifying the repository.

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

NOTE: Full document continues. See repository for complete content after multi-part sync.
