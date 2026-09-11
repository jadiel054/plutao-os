import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  completeExecution,
  getOwnedExecution,
  interruptExecution,
  pauseExecution,
  resumeExecution,
  writeCheckpoint,
} from "@/lib/runtime/service";
import { RECOVERABLE, type ExecutionStatus } from "@/lib/runtime/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;
  const execution = await getOwnedExecution(id, user.id);
  if (!execution) {
    return NextResponse.json({ error: "Execução não encontrada" }, { status: 404 });
  }

  const status = execution.status as ExecutionStatus;
  return NextResponse.json({
    execution,
    recoverable: RECOVERABLE.has(status),
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "checkpoint") {
      const result = await writeCheckpoint(id, user.id, {
        step: body.step ? String(body.step) : undefined,
        taskId: body.taskId !== undefined ? (body.taskId ? String(body.taskId) : null) : undefined,
        note: body.note ? String(body.note) : undefined,
        data: typeof body.data === "object" && body.data ? body.data : undefined,
      });
      if ("error" in result) {
        const status = result.error === "NOT_FOUND" ? 404 : 409;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ execution: result.execution });
    }

    if (action === "pause") {
      const result = await pauseExecution(id, user.id);
      if ("error" in result) {
        const status = result.error === "NOT_FOUND" ? 404 : 409;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ execution: result.execution });
    }

    if (action === "interrupt") {
      const result = await interruptExecution(id, user.id);
      if ("error" in result) {
        const status = result.error === "NOT_FOUND" ? 404 : 409;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ execution: result.execution });
    }

    if (action === "resume") {
      const result = await resumeExecution(id, user.id);
      if ("error" in result) {
        const status = result.error === "NOT_FOUND" ? 404 : 409;
        return NextResponse.json(
          { error: result.error, execution: "execution" in result ? result.execution : undefined },
          { status }
        );
      }
      return NextResponse.json({ execution: result.execution });
    }

    if (action === "complete" || action === "fail") {
      const result = await completeExecution(
        id,
        user.id,
        action === "complete" ? "COMPLETED" : "FAILED",
        body.error ? String(body.error) : undefined
      );
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json({
        execution: result.execution,
        alreadyTerminal: result.alreadyTerminal,
      });
    }

    return NextResponse.json({ error: "Ação não suportada" }, { status: 400 });
  } catch (e) {
    console.error("[executions/:id PATCH]", e);
    return NextResponse.json({ error: "Falha ao atualizar execução" }, { status: 500 });
  }
}
