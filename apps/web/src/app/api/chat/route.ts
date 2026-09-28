/**
 * TEMPORARY STUB for G1 PR #79.
 *
 * The real apps/web/src/app/api/chat/route.ts (~49 KB) cannot be restored via
 * the write tool without corruption (known limit). Operator must run:
 *
 *   git checkout main -- apps/web/src/app/api/chat/route.ts
 *
 * before merge. Base commit: 9ca668ef (file blob de7db931fa1644a7a0b1fb88aed59394f9f730bf).
 *
 * MCP path already emits events (toolSendMessage). Chat UI path is G2.
 * persistChatMessages.ts is present as the G2 wiring target.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error: "chat_route_stub",
      message:
        "G1 PR: chat route is a temporary stub. Restore from main before merge. MCP send_message path is live for event emission.",
    },
    { status: 503 }
  );
}
