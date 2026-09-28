/**
 * Chat API route.
 *
 * G1: event emission is wired on the MCP path (toolSendMessage).
 * Full chat route wiring + modularization of this 49KB file is G2.
 *
 * BEFORE MERGE / to restore for CI: run locally
 *   git checkout main -- apps/web/src/app/api/chat/route.ts
 * Then this stub is replaced by the exact main bytes (SHA de7db931 / base 9ca668ef).
 *
 * Do not generate this file via tool write — large content corrupts.
 */

export { POST } from "./route.main";
export const runtime = "nodejs";
