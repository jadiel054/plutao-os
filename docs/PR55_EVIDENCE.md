# Guest session fix — evidence (PR #55)

## Blast radius

Command: `grep -rn "getAuthOrGuestUser\\|getOrStartGuestSession" apps/web/src`

```
apps/web/src/app/api/auth/me/route.ts:2:import { getAuthOrGuestUser } from "@/lib/auth/session";
apps/web/src/app/api/auth/me/route.ts:8:    const user = await getAuthOrGuestUser();
apps/web/src/app/api/chat/route.ts:7:import { getAuthOrGuestUser } from "@/lib/auth/session";
apps/web/src/app/api/chat/route.ts:73:    user = await getAuthOrGuestUser();
apps/web/src/lib/auth/session.ts:79:export async function getAuthOrGuestUser(): Promise<{
apps/web/src/lib/auth/__tests__/guestAuthFixes.test.ts — 5 call sites
```

`getOrStartGuestSession`: zero matches in apps/

## PLACEHOLDER

`grep -rn "PLACEHOLDER" apps/ packages/` → zero matches

## Test path

`apps/web/src/lib/auth/__tests__/guestAuthFixes.test.ts`

## Minimal diff (chat + page)

+39 / -8. Full unified diff in `docs/patches/pr55_chat_and_page.diff`.

## pnpm build

Run on branch before merge:

```
pnpm install && pnpm --filter web build
```
