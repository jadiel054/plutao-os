import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { runModelStep } from "@/lib/runtime/model/step";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — one model decision step on a RUNNING execution.
 * Requires MODEL_API_KEY. Optional: MODEL_PROVIDER, MODEL_NAME, MODEL_BASE_URL.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const result = await runModelStep(id, user.id);

    if ("error" in result) {
      const status =
        result.error === "NOT_FOUND"
          ? 404
          : result.error === "MODEL_NOT_CONFIGURED"
            ? 503
            : result.error === "MODEL_CALL_FAILED"
              ? 502
              : result.error === "NOT_RUNNING" || result.error === "TERMINAL"
                ? 409
                : 400;
      return NextResponse.json(
        {
          error: result.error,
          hint: "hint" in result ? result.hint : undefined,
          detail: "detail" in result ? result.detail : undefined,
        },
        { status }
      );
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[executions/:id/model-step]", e);
    return NextResponse.json({ error: "Falha no model-step" }, { status: 500 });
  }
}
