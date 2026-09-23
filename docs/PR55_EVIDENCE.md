# Guest session fix — evidence (PR #55)

## Blast radius (`grep -rn "getAuthOrGuestUser\\|getOrStartGuestSession" apps/web/src`)

```
apps/web/src/app/api/auth/me/route.ts:2:import { getAuthOrGuestUser } from "@/lib/auth/session";
apps/web/src/app/api/auth/me/route.ts:8:    const user = await getAuthOrGuestUser();
apps/web/src/app/api/chat/route.ts:7:import { getAuthOrGuestUser } from "@/lib/auth/session";
apps/web/src/app/api/chat/route.ts:73:    user = await getAuthOrGuestUser();
apps/web/src/lib/auth/session.ts:79:export async function getAuthOrGuestUser(): Promise<{
apps/web/src/lib/auth/__tests__/guestAuthFixes.test.ts:89:import { getAuthOrGuestUser } from "../session";
apps/web/src/lib/auth/__tests__/guestAuthFixes.test.ts:100:    const user = await getAuthOrGuestUser();
apps/web/src/lib/auth/__tests__/guestAuthFixes.test.ts:114:    const read1 = await getAuthOrGuestUser();
apps/web/src/lib/auth/__tests__/guestAuthFixes.test.ts:119:    const read2 = await getAuthOrGuestUser();
apps/web/src/lib/auth/__tests__/guestAuthFixes.test.ts:144:    const userMe = await getAuthOrGuestUser();
```

`getOrStartGuestSession`: **zero** matches in apps/

## PLACEHOLDER check

```
grep -rn "PLACEHOLDER" apps/ packages/ → (zero matches)
```

## Test path

`apps/web/src/lib/auth/__tests__/guestAuthFixes.test.ts`

## Diff size (chat + page)

+39 / -8 lines only (minimal).

## pnpm build

Not run in this agent environment (no full monorepo install here). Operator should run on branch before merge:

```
pnpm install && pnpm --filter web build
```
