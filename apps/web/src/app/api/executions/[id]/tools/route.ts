import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { dispatchTool } from "@/lib/runtime/tools/dispatcher";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — dispatch one tool on a RUNNING execution.
 * Body: { name: "note", input: string, taskId?: string }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const name = String(body.name ?? "");
    const input = body.input != null ? String(body.input) : "";
    const taskId = body.taskId ? String(body.taskId) : null;

    if (!name) {
      return NextResponse.json({ error: "name obrigatório" }, { status: 400 });
    }

    const result = await dispatchTool({
      executionId: id,
      userId: user.id,
      name,
      input,
      taskId,
    });

    if ("error" in result) {
      const status =
        result.error === "NOT_FOUND"
          ? 404
          : result.error === "UNKNOWN_TOOL"
            ? 400
            : result.error === "NOT_RUNNING" || result.error === "TERMINAL"
              ? 409
              : 400;
      return NextResponse.json(
        {
          error: result.error,
          hint: "hint" in result ? result.hint : undefined,
          known: "known" in result ? result.known : undefined,
        },
        { status }
      );
    }

    return NextResponse.json(result, { status: result.applied ? 201 : 200 });
  } catch (e) {
    console.error("[executions/:id/tools]", e);
    return NextResponse.json({ error: "Falha no tool dispatcher" }, { status: 500 });
  }
}
