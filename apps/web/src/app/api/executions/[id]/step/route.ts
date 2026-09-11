import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { runStubStep } from "@/lib/runtime/agent-loop-stub";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — run one deterministic Agent Loop stub step on this execution.
 * No LLM. Auth + ownership enforced via getOwnedExecution inside stub.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const result = await runStubStep(id, user.id);

    if ("error" in result) {
      const map: Record<string, number> = {
        NOT_FOUND: 404,
        NOT_RUNNING: 409,
        TERMINAL: 409,
      };
      return NextResponse.json(
        { error: result.error, hint: "hint" in result ? result.hint : undefined },
        { status: map[result.error] ?? 400 }
      );
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[executions/:id/step]", e);
    return NextResponse.json({ error: "Falha no agent step" }, { status: 500 });
  }
}
