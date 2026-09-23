# Recovery — chat page.tsx

**Incident:** commit `5b8b685` overwrote `apps/web/src/app/(app)/chat/page.tsx` with the literal string `PLACEHOLDER`.

**Current state:** emergency stub is deployed (commit after the incident) so the route does not serve garbage text.

**Full file ready:** apply content from the operator artifact `chat_page_WriteGateCard.tsx` (includes WriteGateCard + GATE_PENDING integration).

**Also recoverable from:** parent of `5b8b685` (pre-incident content without gate UI), then re-apply gate integration.

**Neon:** migration `0011_write_gates` is applied and verified on project Plutao.

**Backend already on main:** `WriteGateCard.tsx`, `/api/gates`, `github.ts` GATE_PENDING flow, `gates.ts`, `githubWrite.ts`.
