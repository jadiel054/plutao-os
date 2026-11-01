import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const expected = process.env.AEGIS_API_KEY;
  if (!expected) return true;
  const key =
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  return key === expected;
}

/**
 * Aegis contract: POST /api/agent/execute
 * Primary command for Plutão: execute_real
 *
 * Write-gate: if body.approved !== true and no approved_by,
 * returns a gated proposal (does not mutate external systems).
 */
export async function POST(request: Request) {
  try {
    if (!authorized(request)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const command = String(body.command || "execute_real");
    const title = String(body.mission_title || body.title || "Missão");
    const input = String(body.input || body.mission_context || body.mission_description || "");
    const taskId = body.task_id ? String(body.task_id) : null;
    const approved =
      body.approved === true ||
      Boolean(body.approved_by) ||
      String(body.gate || "") === "approved";

    if (command === "plan_real_mission") {
      return NextResponse.json({
        success: true,
        agent: "Plutao",
        command,
        output: `Plutão recebeu plan_real_mission — planejamento é papel do Morpheus. Contexto: ${title}`,
      });
    }

    if (command === "synthesize_real") {
      return NextResponse.json({
        success: true,
        agent: "Zarith",
        command,
        output: "Síntese deve ser feita pelo Zarith. Plutão só executa.",
      });
    }

    if (command !== "execute_real" && command !== "execute") {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported command: ${command}`,
          supported: ["execute_real", "plan_real_mission", "synthesize_real"],
        },
        { status: 400 }
      );
    }

    if (!approved) {
      const proposal = [
        `# Proposta de execução Plutão — ${title}`,
        taskId ? `task_id: ${taskId}` : "",
        "",
        "## Entrada (plano / contexto)",
        input.slice(0, 4000) || "(vazio)",
        "",
        "## Ações pretendidas (bloqueadas até aprovação)",
        "1. Validar escopo e alvos (repo, ambiente, secrets).",
        "2. Preparar mudanças mínimas.",
        "3. Aplicar somente após write-gate do operador (Aegis /approve).",
        "",
        "## Status",
        "**awaiting_approval** — nenhum write externo foi executado.",
        "",
        `_Plutão /api/agent/execute · ${new Date().toISOString()}_`,
      ]
        .filter(Boolean)
        .join("\n");

      return NextResponse.json({
        success: true,
        agent: "Plutao",
        command: "execute_real",
        gated: true,
        status: "awaiting_approval",
        output: proposal,
      });
    }

    const result = [
      `# Execução Plutão (gate aprovado) — ${title}`,
      taskId ? `task_id: ${taskId}` : "",
      `approved_by: ${String(body.approved_by || "operator")}`,
      "",
      "## Contexto",
      input.slice(0, 4000),
      "",
      "## Resultado",
      "Gate liberado. Nesta fase o worker registra a execução autorizada.",
      "Connectors de write (GitHub/Vercel/Render) permanecem atrás dos gates internos do Plutão.",
      "Nenhuma mutação destrutiva automática foi disparada por este endpoint sozinho.",
      "",
      "## Próximo",
      "Zarith deve sintetizar o histórico completo da missão.",
      "",
      `_Plutão /api/agent/execute · ${new Date().toISOString()}_`,
    ]
      .filter(Boolean)
      .join("\n");

    return NextResponse.json({
      success: true,
      agent: "Plutao",
      command: "execute_real",
      gated: false,
      status: "completed",
      output: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[api/agent/execute]", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: "plutao-agent-execute",
    commands: ["execute_real"],
    write_gate: true,
  });
}
