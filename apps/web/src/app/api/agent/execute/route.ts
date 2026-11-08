import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkMcpRateLimit } from "@/lib/mcp/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Fase 0 hardening (A1):
 * - Fail-closed when AEGIS_API_KEY is unset (503).
 * - Constant-time key comparison.
 * - Body flags (approved / approved_by / gate) are IGNORED — they never authorize write.
 * - Real GitHub smoke write removed: this endpoint has no user session / H1 write-gate
 *   context (userId + consumeGateForWrite). Reusing H1 would invent a parallel gate path.
 *   Until Aegis is wired to the real write-gate table, the endpoint only returns proposals
 *   with status awaiting_approval.
 * - Persistent rate limit (rate_limit_buckets via checkMcpRateLimit).
 * - GET requires the same auth and does not expose smoke target.
 */

function aegisKeyConfigured(): string | null {
  const expected = process.env.AEGIS_API_KEY;
  if (!expected || expected.length === 0) return null;
  return expected;
}

function extractPresentedKey(request: Request): string {
  return (
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  );
}

/** Constant-time compare; never throws on length mismatch. */
function keyMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still run a dummy compare to keep timing closer to the equal-length path.
    const dummy = Buffer.alloc(b.length);
    timingSafeEqual(dummy, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function authorized(request: Request): "ok" | "missing_config" | "unauthorized" {
  const expected = aegisKeyConfigured();
  if (!expected) return "missing_config";
  const presented = extractPresentedKey(request);
  if (!keyMatches(presented, expected)) return "unauthorized";
  return "ok";
}

function rateLimitKey(request: Request): string {
  const presented = extractPresentedKey(request);
  if (presented) {
    return `aegis:execute:${createHash("sha256").update(presented).digest("hex").slice(0, 24)}`;
  }
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `aegis:execute:ip:${fwd || "unknown"}`;
}

async function enforceRateLimit(request: Request): Promise<NextResponse | null> {
  const result = await checkMcpRateLimit(rateLimitKey(request));
  if (result.ok) return null;
  return NextResponse.json(
    { success: false, error: "Rate limit exceeded", retry_after_sec: result.retryAfterSec },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  );
}

/**
 * Aegis contract: POST /api/agent/execute
 * Always proposal-only (awaiting_approval). No external write from this route.
 */
export async function POST(request: Request) {
  try {
    const auth = authorized(request);
    if (auth === "missing_config") {
      return NextResponse.json(
        { success: false, error: "AEGIS_API_KEY not configured — endpoint fail-closed" },
        { status: 503 }
      );
    }
    if (auth === "unauthorized") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const limited = await enforceRateLimit(request);
    if (limited) return limited;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const command = String(body.command || "execute_real");
    const title = String(body.mission_title || body.title || "Missão");
    const input = String(body.input || body.mission_context || body.mission_description || "");
    const taskId = body.task_id ? String(body.task_id) : null;

    // Body approval flags are intentionally ignored (H1 principle).
    void body.approved;
    void body.approved_by;
    void body.gate;

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

    const proposal = [
      `# Proposta de execução Plutão — ${title}`,
      taskId ? `task_id: ${taskId}` : "",
      "",
      "## Entrada (plano / contexto)",
      input.slice(0, 4000) || "(vazio)",
      "",
      "## Ações pretendidas (bloqueadas até aprovação via write gate H1)",
      "1. Validar escopo e alvos (repos, ambientes, secrets).",
      "2. Qualquer write externo exige gate persistido (userId, status approved, payload_hash, consumo atômico).",
      "3. Este endpoint não executa write: flags approved/approved_by/gate no body são ignoradas.",
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
      write_ok: false,
      output: proposal,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[api/agent/execute]", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = authorized(request);
  if (auth === "missing_config") {
    return NextResponse.json(
      { success: false, error: "AEGIS_API_KEY not configured — endpoint fail-closed" },
      { status: 503 }
    );
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceRateLimit(request);
  if (limited) return limited;

  return NextResponse.json({
    service: "plutao-agent-execute",
    commands: ["execute_real"],
    write_gate: true,
    // smoke_target intentionally omitted — do not leak owner/repo without need
    note: "Proposal-only; real writes require H1 write gate outside this route.",
  });
}
