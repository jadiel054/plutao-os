# PROJECT_SPECIFICATION — Part 2 (sections 29–84)

Continuation of the authoritative Architecture Baseline v1.0.
See also `docs/PROJECT_SPECIFICATION.md` (sections 1–28).

---

# 29. RETRIEVAL ROUTER

Retrieval levels:

```text
L0 exact
L1 lexical
L2 semantic
L3 hybrid
L4 graph/local
L5 global synthesis
```

Choose the cheapest strategy capable of answering the question.

Examples:

```text
"Where is MAX_LLM_ATTEMPTS?"
→ lexical

"How does the permission system work?"
→ hybrid

"What components depend on Mission Engine?"
→ graph/hybrid

"What are the main architectural problems?"
→ global/graph

"What was our database decision?"
→ decision memory
```

---

# 30. RERANKER

Reranking is optional.

Pipeline:

```text
20 lexical
+
20 semantic
→ fusion
→ candidates
→ reranker
→ top 5–10
```

Expose through:

```text
RerankerAdapter
```

The Retrieval Router decides when it is worth the cost.

---

# 31. KNOWLEDGE GRAPH

Graph capabilities are specialized.

Do not introduce a graph database in V1 without evidence.

Start with relational structures:

```text
Entity
Relationship
EntityProperty
```

Possible relationships:

```text
depends_on
uses
contains
implements
calls
created_by
verified_by
supersedes
contradicts
```

---

# 32. RETRIEVAL SECURITY

Retrieved documents are untrusted data, never system instructions.

Pipeline:

```text
Document
→ Integrity Check
→ Source Trust
→ Content Scan
→ Parsing
→ Injection Detection
→ Chunking
→ Indexing
```

Retrieval:

```text
Query
→ Identity
→ Authorization
→ Retrieval
→ Security Filter
→ Injection Scan
→ Reranking
→ Provenance
→ Context
```

Permissions must be applied before unauthorized content enters model context.

---

# 33. DOCUMENT INTEGRITY

Store a cryptographic content hash.

If source content changes unexpectedly:

```text
hash mismatch
→ quarantine
→ re-index
→ audit
```

---

# 34. KNOWLEDGE PROVENANCE

KnowledgeChunk:

```text
id
document_id
source
source_type
path
locator
content
content_hash
embedding
metadata
trust_level
permissions
created_at
updated_at
indexed_at
```

RetrievedChunk:

```text
chunk_id
retrieval_method
rank
score
rerank_score
retrieval_timestamp
```

Claims should be traceable to source/evidence.

---

# 35. KNOWLEDGE CONFLICT

When sources disagree:

```text
CONFLICT
```

Resolver considers:

```text
source authority
document version
timestamp
project state
explicit decisions
verification
```

Never silently choose conflicting information.

---

# 36. SOURCE AUTHORITY

Initial heuristic:

```text
SYSTEM POLICY
→ PROJECT SPECIFICATION
→ EXPLICIT DECISION
→ CURRENT PROJECT STATE
→ OFFICIAL DOCUMENTATION
→ VERIFIED EXECUTION RESULT
→ AGENT-INFERRED KNOWLEDGE
→ UNVERIFIED MEMORY
```

Domain-specific rules may override this.

---

# 37. KNOWLEDGE VERIFICATION

Knowledge may be verified against real project state.

Example:

```text
Memory:
"Vercel deployment uses Node 20."

Verification:
inspect package/config/deployment
```

Result:

```text
verified=true
```

or:

```text
verified=false
```

Keep verification history.

---

# 38. RETRIEVAL EVALUATION

Create a versioned:

```text
Knowledge Evaluation Dataset
```

Metrics:

```text
Recall@K
Precision@K
MRR
NDCG
Context Precision
Context Recall
Rerank Lift
Retrieval Latency
Retrieval Cost
Answer Groundedness
Citation Accuracy
```

---

# 39. TOKEN BUDGET MANAGER

Create:

```text
TokenBudgetManager
```

---

# 40. SEMANTIC CACHE

Semantic caching is optional.

Never use semantic cache to bypass authorization.

---

# 41. EXECUTION SNAPSHOT

Long-running missions snapshot model, agent profile, skills, tools, policies, knowledge, project state.

---

# 42. EXECUTION HISTORY

Separate Chat History, Execution History, Audit History.

---

# 43. TOOL BROKER

Agent → Tool Broker → Policy Engine → Resource Lock → Sandbox Broker → Tool → Evidence → State

---

# 44. PERMISSION ENGINE

DENY always wins.

Effective permission: User Intent ∩ Agent Capability ∩ Project Policy ∩ Mission Policy ∩ Tool Policy ∩ Security Ceiling

---

# 45. APPROVAL ENGINE

Results: ALLOW | ASK | DENY

---

# 46. SANDBOX

Preferred V1: rootless container, non-root, seccomp, restricted network, resource limits, isolated workspace.

Profiles: readonly, coding, testing, web, deployment.

---

# 47. NETWORK POLICY

Allow only approved destinations. Deny private networks, metadata endpoints, localhost, unapproved destinations.

---

# 48. SECRETS

Secrets never enter model context. Secret is an execution capability, not agent context.

---

# 49. MCP

Trust: TRUSTED | REVIEWED | UNTRUSTED. Untrusted MCP cannot execute automatically.

---

# 50. RESOURCE LOCKS

FILE, DIRECTORY, GIT_BRANCH, WORKTREE, DATABASE, DEPLOYMENT, ENVIRONMENT, CONNECTOR_RESOURCE.

---

# 51. CHECKPOINTS

Checkpoint != Git commit. Preserves mission/task/Git/file/context/agent/tool/evidence state.

---

# 52. RECOVERY

Completed tasks remain completed. Use reconciliation/idempotency for side effects.

---

# 53. VERIFICATION

IMPLEMENTER → RESULT → EVIDENCE COLLECTOR → VERIFIER → PASS / FAIL / INCONCLUSIVE

Levels: deterministic, semantic, adversarial.

---

# 54. EVIDENCE ENGINE

Requirement → Evidence → Verification. Claims without evidence are not VERIFIED.

---

*(Sections 55–84 continue in PROJECT_SPECIFICATION-part3.md)*
