import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { runStubStep } from "@/lib/runtime/agent-loop-stub";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const result = await runStubStep(id, user.id);

    if ("error" in result) {
      const code = result.error;
      const status =
        code === "NOT_FOUND" ? 404 : code === "NOT_RUNNING" || code === "TERMINAL" ? 409 : 400;
      const hint = "hint" in result ? result.hint : undefined;
      return NextResponse.json({ error: code, hint }, { status });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[executions/:id/step]", e);
    return NextResponse.json({ error: "Falha no agent step" }, { status: 500 });
  }
}
