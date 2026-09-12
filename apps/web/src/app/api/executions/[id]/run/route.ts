import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { runAgentLoop, MAX_ITERATIONS } from "@/lib/runtime/agent-loop";
import { getOwnedExecution } from "@/lib/runtime/service";
import { RECOVERABLE, type ExecutionStatus } from "@/lib/runtime/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — execute the agent loop on a RUNNING execution.
 * This is the automated version: Model → Tool → Result → Model (repeated).
 * 
 * Body options:
 * - maxIterations: number (default: 10, max: 50)
 * 
 * Returns:
 * - ok: boolean
 * - executionId: string
 * - iterations: number
 * - evidenceIds: string[]
 * - finalStatus: ExecutionStatus | null
 * - stopReason: string
 * - error?: string
 * - details?: LoopIterationResult[]
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;
  
  try {
    // Parse body for optional maxIterations
    const body = await req.json().catch(() => ({}));
    const maxIterations = Math.min(
      Number(body.maxIterations) || MAX_ITERATIONS,
      50 // Hard cap at 50 iterations
    );

    // Verify execution exists and is recoverable
    const execution = await getOwnedExecution(id, user.id);
    if (!execution) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const status = execution.status as ExecutionStatus;
    if (!RECOVERABLE.has(status)) {
      return NextResponse.json(
        {
          error: "NOT_RECOVERABLE",
          currentStatus: status,
        },
        { status: 409 }
      );
    }

    // Run the agent loop
    const result = await runAgentLoop(id, user.id, maxIterations);

    if (!result.ok) {
      const statusCode = result.stopReason?.startsWith("MODEL_NOT_CONFIGURED")
        ? 503
        : result.stopReason?.startsWith("NOT_FOUND")
          ? 404
          : result.stopReason?.startsWith("TERMINAL_STATE")
            ? 409
            : 400;

      return NextResponse.json(result, { status: statusCode });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    console.error("[executions/:id/run]", e);
    const error = e instanceof Error ? e.message : "Falha no agent loop";
    return NextResponse.json(
      {
        ok: false,
        executionId: id,
        iterations: 0,
        evidenceIds: [],
        finalStatus: null,
        stopReason: "INTERNAL_ERROR",
        error,
      },
      { status: 500 }
    );
  }
}
