import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getAccessToken, getConnectorRow } from "@/lib/connectors/service";
import { getOwnedExecution } from "@/lib/runtime/service";
import { dispatchTool } from "@/lib/runtime/tools/dispatcher";
import { KNOWN_TOOLS } from "@/lib/runtime/tools/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET — inventário de tools disponíveis nesta execução + estado do conector GitHub.
 * Útil para o Executor e para smoke tests (sem precisar chamar a tool).
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const execution = await getOwnedExecution(id, user.id);
  if (!execution) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const ghRow = await getConnectorRow(user.id, "github");
  const ghToken = await getAccessToken(user.id, "github");

  return NextResponse.json({
    executionId: id,
    executionStatus: execution.status,
    tools: [
      {
        name: "note",
        requiresConnector: null,
        available: true,
        description: "Anotar texto como evidência",
      },
      {
        name: "filesystem",
        requiresConnector: null,
        available: true,
        description: "Leitura/escrita no workspace da execução",
      },
      {
        name: "github",
        requiresConnector: "github",
        available: Boolean(ghToken),
        description:
          "REST GitHub via OAuth do usuário (repos, issues, pulls, actions)",
        connectorStatus: ghRow?.status ?? "disconnected",
        accountLogin: ghRow?.accountLogin ?? null,
        actions: [
          "repos_list",
          "repo_get",
          "issues_list",
          "issues_get",
          "pulls_list",
          "actions_list",
        ],
      },
    ],
    known: [...KNOWN_TOOLS],
  });
}

/**
 * POST — dispatch one tool on a RUNNING execution.
 * Body: { name: "note" | "filesystem" | "github", input: string, taskId?: string }
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
