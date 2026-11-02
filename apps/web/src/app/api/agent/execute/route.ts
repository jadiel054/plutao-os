import { NextResponse } from "next/server";
import { githubPushFiles } from "@/lib/connectors/githubWrite";

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
 * Safe smoke write target — private sandbox only.
 * Override with SMOKE_GITHUB_OWNER / SMOKE_GITHUB_REPO.
 */
function smokeTarget() {
  return {
    owner: process.env.SMOKE_GITHUB_OWNER || "jadiel054",
    repo: process.env.SMOKE_GITHUB_REPO || "aegis-smoke-sandbox",
    branch: process.env.SMOKE_GITHUB_BRANCH || "main",
  };
}

async function trySmokeGithubWrite(opts: {
  taskId: string | null;
  title: string;
  approvedBy: string;
}): Promise<{ ok: boolean; detail: string }> {
  const token =
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_PAT ||
    "";
  if (!token) {
    return {
      ok: false,
      detail:
        "GITHUB_TOKEN ausente no Plutão — write real não executado. Defina GITHUB_TOKEN (repo scope) no Vercel do plutao-os.",
    };
  }

  const { owner, repo, branch } = smokeTarget();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `smoke/${stamp}-${(opts.taskId || "manual").slice(0, 8)}.md`;
  const content = [
    `# Smoke write — Aegis write-gate`,
    ``,
    `- task_id: ${opts.taskId || "(none)"}`,
    `- title: ${opts.title}`,
    `- approved_by: ${opts.approvedBy}`,
    `- at: ${new Date().toISOString()}`,
    `- agent: Plutão /api/agent/execute`,
    ``,
    `Arquivo criado automaticamente após aprovação humana no Aegis/Telegram.`,
    `Alvo restrito: ${owner}/${repo} (sandbox).`,
    ``,
  ].join("\n");

  const res = await githubPushFiles(token, {
    owner,
    repo,
    branch,
    message: `smoke(aegis): ${opts.title.slice(0, 72)}`,
    files: [{ path, content }],
  });

  if (!res.ok) {
    return { ok: false, detail: `GitHub push falhou: ${res.error}` };
  }

  return {
    ok: true,
    detail: [
      `WRITE REAL OK`,
      res.output,
      `path: ${path}`,
      res.htmlUrl ? `commit_url: ${res.htmlUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Aegis contract: POST /api/agent/execute
 * Primary command for Plutão: execute_real
 *
 * Write-gate: if body.approved !== true and no approved_by,
 * returns a gated proposal (does not mutate external systems).
 *
 * After approval: optional smoke write to private aegis-smoke-sandbox
 * when GITHUB_TOKEN is configured.
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
    const approvedBy = String(body.approved_by || "operator");

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
      const { owner, repo } = smokeTarget();
      const proposal = [
        `# Proposta de execução Plutão — ${title}`,
        taskId ? `task_id: ${taskId}` : "",
        "",
        "## Entrada (plano / contexto)",
        input.slice(0, 4000) || "(vazio)",
        "",
        "## Ações pretendidas (bloqueadas até aprovação)",
        "1. Validar escopo e alvos (repos, ambientes, secrets).",
        `2. Smoke write seguro em \\`${owner}/${repo}\\` (arquivo em smoke/).`,
        "3. Nenhuma mutação fora do sandbox sem gate explícito.",
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

    // ── Gate aprovado: smoke write controlado ─────────────────────────────
    const smoke = await trySmokeGithubWrite({
      taskId,
      title,
      approvedBy,
    });

    const result = [
      `# Execução Plutão (gate aprovado) — ${title}`,
      taskId ? `task_id: ${taskId}` : "",
      `approved_by: ${approvedBy}`,
      "",
      "## Contexto",
      input.slice(0, 3000),
      "",
      "## Write real (sandbox)",
      smoke.detail,
      "",
      "## Status",
      smoke.ok ? "**completed** com evidência no GitHub sandbox" : "**completed_partial** — gate ok, write sandbox não concluído",
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
      status: smoke.ok ? "completed" : "completed_partial",
      write_ok: smoke.ok,
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
    smoke_target: smokeTarget(),
  });
}
