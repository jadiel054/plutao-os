# PROJECT_SPECIFICATION.md

## Personal Autonomous AI Operating System
### Master Specification — Architecture Baseline v1.0

**Status:** DESIGNED / PRE-IMPLEMENTATION

> This document is the authoritative implementation specification for the project repository. The implementing agent must read it completely before modifying the repository.

---

**Reading order on GitHub (complete specification, split only for transport limits):**

| File | Sections |
|------|----------|
| [PROJECT_SPECIFICATION.md](./PROJECT_SPECIFICATION.md) | **1–28** (this file, full text) |
| [PROJECT_SPECIFICATION-part2.md](./PROJECT_SPECIFICATION-part2.md) | **29–54** (full text) |
| [PROJECT_SPECIFICATION-part3.md](./PROJECT_SPECIFICATION-part3.md) | **55–84** + Research Basis (full text) |

The single uninterrupted file also exists in the project sandbox.

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

# 4. PRODUCT OBJECT MODEL

```text
ACCOUNT
├── Agents
├── Models
├── Tools
├── Skills
├── Connectors
├── Policies
└── Workflow Templates

AGENT / BOT
├── Identity
├── Personality
├── Memory
├── Skills
├── Tools
├── Connectors
├── Projects
├── Permissions
├── Automations
├── Runtime
├── Knowledge
├── Voice
├── Chats
├── Missions
└── Artifacts

PROJECT
├── Repository
├── Project Specification
├── Architecture
├── Project Rules
├── Current State
├── Decisions
├── Agents
├── Skills
├── Tools
├── Connectors
├── MCP
├── Memory
├── Knowledge
├── Missions
├── Tasks
├── Workflows
├── Automations
├── Artifacts
├── Tests
├── Deployments
├── Checkpoints
├── Verification History
└── Audit History

WORK
├── Chat
├── Mission
├── Task
├── Workflow
├── Automation
├── Artifact
├── Evidence
├── Checkpoint
└── Execution
```

Definitions:

- Agent = who executes.
- Project = where work lives.
- Chat = conversational interface.
- Mission = what must be achieved.
- Workflow = how complex work is coordinated.
- Task = executable unit.
- Skill = reusable expertise.
- Tool = executable capability.
- Connector = authenticated external integration.
- Policy = what is allowed.
- Automation = when work starts.
- Artifact = durable output.
- Evidence = why a result can be trusted.
- Checkpoint = recoverable internal state.
- Execution = what actually happened.

---

# 5. MISSION ENGINE

Mission lifecycle:

```text
CREATED
→ UNDERSTANDING
→ PLANNING
→ EXECUTING
→ VERIFYING
→ CORRECTING
→ COMPLETED
```

Alternative states:

```text
BLOCKED
CANCELLED
FAILED
```

Mission object:

```text
id
objective
context
constraints
plan
definition_of_done
current_state
completed_steps
pending_steps
evidence
errors
decisions
spawned_agents
tool_history
checkpoints
status
created_at
updated_at
```

A mission cannot be completed merely because the model says it is complete. Definition of Done and evidence are required.

---

# 6. TASK ENGINE

Mission = user-level objective.

Task = executable unit.

Tasks are dynamic and may create follow-up tasks.

Example:

```text
T008 tests
  ↓
failure
  ↓
T009 fix
  ↓
T010 retest
```

Task states:

```text
CREATED
READY
RUNNING
WAITING
BLOCKED
COMPLETED
FAILED
CANCELLED
```

Tasks support dependencies.

---

# 7. WORKFLOW ENGINE

Workflow is orchestration. Task is work.

Workflow capabilities:

- DAG dependencies;
- fan-out/fan-in;
- barriers;
- parallel execution;
- sequential execution;
- retries;
- timers;
- event waits;
- human approval;
- cancellation;
- recovery;
- budgets.

Budgets:

```text
max_agents
max_parallel_agents
max_tokens
max_runtime
max_tool_calls
max_cost
max_retries
```

Cancellation:

```text
RUNNING
→ CANCELLATION_REQUESTED
→ DRAINING
→ CANCELLED
```

Partial results are preserved and resource locks released.

---

# 8. DURABLE EXECUTION

The domain must expose:

```text
DurableExecutionAdapter
├── InngestAdapter
├── TriggerAdapter
├── TemporalAdapter
├── BullMQAdapter
└── Local/FakeAdapter
```

Conceptual interface:

```text
startWorkflow()
scheduleTask()
pauseExecution()
resumeExecution()
cancelExecution()
waitForEvent()
scheduleTimer()
retryExecution()
spawnExecution()
getExecutionState()
```

## Current V1 candidate: Inngest

Inngest is the current candidate because its current platform provides durable, checkpointed, retriable steps, persisted state, event/timer waits, and independent step retries. Successful steps are memoized so a retry can resume from the failed step rather than replaying completed work. It supports TypeScript, Python, and Go.

This is a candidate, not permission to blindly install it. The adapter boundary must remain intact.

Side-effecting work must be idempotent:

```text
CHECK
→ RECONCILE
→ EXECUTE ONLY IF NECESSARY
```

---

# 9. AGENT RUNTIME

Agent loop:

```text
1. recover state
2. determine immediate objective
3. select context
4. build runtime context
5. call model
6. interpret response
7. if tool call:
   validate
   authorize
   execute
   record
   update state
8. evaluate whether mission is actually complete
9. update mission
10. determine next action
```

Turn != Mission.

A mission may span many model turns.

---

# 10. AGENT STEP

```text
AgentStep
├── id
├── mission_id
├── task_id
├── agent_id
├── type
├── status
├── input
├── context_snapshot
├── model
├── model_version
├── tool_calls
├── output
├── evidence
├── attempt
├── started_at
├── completed_at
├── error
└── runtime_execution_id
```

Types:

```text
MODEL_CALL
TOOL_CALL
SUBAGENT_RUN
CONTEXT_BUILD
VERIFICATION
APPROVAL
WAIT
DECISION
STATE_UPDATE
```

---

# 11. SUBAGENTS

Subagent contract:

```text
task_id
objective
role
allowed_tools
capability
workspace
constraints
expected_output
definition_of_done
```

Return:

```text
status
summary
findings
evidence
files_changed
tests
warnings
recommendation
```

Never accept "done" without evidence.

Recommended capability levels:

```text
read-only
read-write
execute
all
```

Repository-modifying subagents should preferably use isolated Git worktrees.

---

# 12. CONTEXT ENGINE

The Context Engine is a context compiler.

Input:

```text
user intent
mission
task
agent
project
memory
knowledge
files
Git state
previous execution
tool results
policies
errors
evidence
```

Output:

```text
Runtime Context
```

Layers:

```text
L0 SYSTEM
L1 SECURITY / POLICY
L2 AGENT IDENTITY
L3 PROJECT RULES
L4 MISSION
L5 CURRENT TASK
L6 RELEVANT KNOWLEDGE
L7 RELEVANT MEMORY
L8 RELEVANT FILES
L9 RECENT EXECUTION
L10 TOOL RESULTS
L11 VERIFICATION
```

Not every layer is included in every call.

Never inject the entire repository or entire conversation by default.

---

# 13. CONTEXT BUDGET

Every AgentStep has a context budget.

The budget must account for:

- model context window;
- reserved output;
- provider overhead;
- structured output;
- tool calls;
- retries.

The Context Engine must distinguish:

```text
target_context
hard_limit
```

and preserve reserve capacity.

---

# 14. CONTEXT COMPACTION

Operational compaction preserves:

```text
objective
state
decisions
completed_tasks
pending_tasks
files_changed
errors
solutions
evidence
Git
next_action
```

Semantic summarization preserves:

```text
discussion
learned information
preferences
conclusions
```

These are different operations.

---

# 15. MODEL ROUTER

The Agent Runtime must not hardcode provider/model names.

The agent expresses requirements:

```text
reasoning=high
coding=true
tools=true
context=large
structured_output=true
```

TaskProfile:

```text
task_type
required_capabilities
reasoning_level
context_required
tool_use_required
vision_required
structured_output_required
latency_priority
cost_priority
quality_priority
privacy_policy
maximum_cost
maximum_latency
preferred_providers
forbidden_providers
fallback_policy
```

Routing:

```text
TaskProfile
→ Capability Filter
→ Policy Filter
→ Provider Health
→ Cost/Latency Estimator
→ Quality Score
→ Candidate Models
→ Selected Model
→ Fallback Chain
```

---

# 16. MODEL REGISTRY

Model:

```text
provider
model_id
version
capabilities
context_window
max_output
input_cost
output_cost
cached_input_cost
latency_profile
throughput_profile
tool_calling
structured_output
vision
audio
reasoning
coding
reliability
privacy_policy
availability
status
```

Provider != Model.

---

# 17. MODEL GATEWAY

Provider-specific APIs are normalized behind adapters.

Interface:

```text
generate()
stream()
countTokens()
validateCapabilities()
toolCall()
structuredOutput()
cancel()
```

Potential adapters:

```text
OpenAIAdapter
AnthropicAdapter
GeminiAdapter
OpenRouterAdapter
GroqAdapter
CerebrasAdapter
DeepSeekAdapter
GLMAdapter
```

Only implement providers actually configured and verified.

Never invent endpoints.

---

# 18. MODEL FALLBACK AND HEALTH

Fallback must be capability-aware.

Respect:

```text
required capabilities
policy
privacy
health
cost
latency
availability
```

Circuit breaker:

```text
HEALTHY
→ DEGRADED
→ OPEN
→ COOLDOWN
→ HALF_OPEN
→ HEALTHY
```

---

# 19. MEMORY

Memory != Knowledge.

Memory types:

```text
EPISODIC
SEMANTIC
PROCEDURAL
PREFERENCE
DECISION
WORKING
```

Memory states:

```text
candidate
active
stale
superseded
contradicted
archived
```

Memory object:

```text
id
type
scope
content
source
evidence
confidence
importance
created_at
updated_at
last_verified
expires_at
status
```

---

# 20. MEMORY SCOPE

Scopes:

```text
GLOBAL
USER
AGENT
PROJECT
MISSION
SESSION
```

Permissions must prevent cross-project leakage.

---

# 21. MEMORY PROMOTION

Do not persist every transient thought.

```text
Working Memory
→ Candidate Memory
→ Validation
→ Persistent Memory
```

Critical decisions may require explicit user confirmation.

---

# 22. MEMORY CONFIDENCE

Confidence is metadata, not truth.

Track:

```text
confidence
source_count
source
evidence
last_verified
```

The system must distinguish:

```text
KNOWN
KNOWN_BUT_STALE
UNKNOWN
CONFLICTING
```

---

# 23. KNOWLEDGE ENGINE

Knowledge belongs to project/source material.

Conceptual supported sources:

```text
PDF
Markdown
TXT
DOCX
CSV
JSON
HTML
CODE
GIT
URL
EMAIL
API
IMAGE
```

Pipeline:

```text
SOURCE
→ INGESTION
→ PARSING
→ NORMALIZATION
→ METADATA
→ SEMANTIC CHUNKING
→ ENRICHMENT
→ EMBEDDING
→ INDEX
```

---

# 24. SEMANTIC CHUNKING

Do not use fixed token chunking universally.

Code:

```text
file
→ class
→ function
→ logical block
```

Markdown:

```text
document
→ heading
→ subsection
→ logical paragraph
```

PDF:

```text
document
→ page
→ section
→ paragraph/table
```

JSON:

```text
object
→ logical structure
```

---

# 25. CONTEXTUAL RETRIEVAL

Knowledge chunks may receive contextual enrichment before embedding/indexing.

The original source and enriched context must both remain available for provenance.

---

# 26. HYBRID SEARCH

Default retrieval:

```text
Lexical Search
+
Semantic Search
→ Fusion
→ Optional Reranker
→ Security Filter
→ Provenance
→ Context Compiler
```

V1 candidate:

```text
PostgreSQL
+
PostgreSQL Full Text Search
+
pgvector
```

pgvector currently supports exact and approximate vector search, HNSW and IVFFlat, and documents hybrid search using PostgreSQL full-text search with Reciprocal Rank Fusion or cross-encoder reranking.

---

# 27. VECTOR STORE ABSTRACTION

Use:

```text
VectorStoreAdapter
```

Do not couple domain logic directly to pgvector.

V1 candidate:

```text
PostgreSQL + pgvector
```

Future alternatives remain possible.

---

# 28. EMBEDDING SERVICE

Use:

```text
EmbeddingService
```

Interface:

```text
embedDocument()
embedQuery()
getDimensions()
getModel()
getVersion()
estimateCost()
```

Store:

```text
embedding_provider
embedding_model
embedding_version
embedding_dimensions
```

Changing embedding models requires controlled reindexing.

---
