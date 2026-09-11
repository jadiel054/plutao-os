import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { tasks } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnedTask } from "@/lib/missions/ownership";
import {
  canTaskTransition,
  isTaskStatus,
  nextTaskStatuses,
  TASK_TERMINAL,
  type TaskStatus,
} from "@/lib/missions/task-lifecycle";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;
  const owned = await getOwnedTask(id, user.id);
  if (!owned) {
    return NextResponse.json({ error: "Task não encontrada" }, { status: 404 });
  }

  return NextResponse.json({
    task: owned.task,
    allowedTransitions: nextTaskStatuses(String(owned.task.status)),
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;
  const owned = await getOwnedTask(id, user.id);
  if (!owned) {
    return NextResponse.json({ error: "Task não encontrada" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const action = String(body.action ?? "");
    const from = String(owned.task.status);

    let to: TaskStatus;

    if (action === "cancel") {
      if (TASK_TERMINAL.has(from as TaskStatus)) {
        return NextResponse.json({ error: "Task já finalizada" }, { status: 409 });
      }
      to = "CANCELLED";
    } else if (action === "transition") {
      const target = String(body.toStatus ?? "");
      if (!isTaskStatus(target)) {
        return NextResponse.json({ error: "Status inválido" }, { status: 400 });
      }
      if (!canTaskTransition(from, target)) {
        return NextResponse.json(
          { error: "Transição não permitida", from, to: target, allowed: nextTaskStatuses(from) },
          { status: 409 }
        );
      }
      to = target;
    } else {
      return NextResponse.json({ error: "Ação não suportada" }, { status: 400 });
    }

    const now = new Date();
    const patch: {
      status: string;
      updatedAt: Date;
      startedAt?: Date | null;
      completedAt?: Date | null;
    } = { status: to, updatedAt: now };

    if (to === "RUNNING" && !owned.task.startedAt) {
      patch.startedAt = now;
    }
    if (to === "COMPLETED" || to === "FAILED" || to === "CANCELLED") {
      patch.completedAt = now;
    }

    const db = getDb();
    const updated = await db
      .update(tasks)
      .set(patch)
      .where(eq(tasks.id, id))
      .returning();

    return NextResponse.json({
      task: updated[0],
      allowedTransitions: nextTaskStatuses(to),
    });
  } catch (e) {
    console.error("[tasks/:id PATCH]", e);
    return NextResponse.json({ error: "Falha ao atualizar task" }, { status: 500 });
  }
}
