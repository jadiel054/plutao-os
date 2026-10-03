/**
 * Tool vercel — REST via token OAuth/PAT do conector do usuário.
 * Reads: executam direto.
 * Writes: criam write_gate (pending) até aprovação humana; depois executam.
 */

import { getConnectorRow, getAccessToken } from "@/lib/connectors/service";
import { runRestCapability } from "@/lib/connectors/runRestCapability";
import { vercelManifest } from "@/lib/connectors/manifests/vercel";
import { vercelCreateProject, vercelCreateDeployment } from "@/lib/connectors/vercelWrite";
import { createWriteGate } from "@/lib/connectors/gates";
import type { ConnectorCapability } from "@plutao/domain";
import type { ToolResult } from "./types";

function parseCapabilities(raw: unknown): ConnectorCapability[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      name: String(c.name ?? ""),
      description: c.description ? String(c.description) : undefined,
      kind: c.kind === "mcp_tool" ? ("mcp_tool" as const) : ("rest_api" as const),
      mode: c.mode === "write" ? ("write" as const) : ("read" as const),
    }))
    .filter((c) => c.name.length > 0);
}

const READ_ACTIONS = ["projects_list", "deployments_list", "deployment_get"] as const;
const WRITE_ACTIONS = ["project_create", "deploy_create"] as const;

type VercelAction = (typeof READ_ACTIONS)[number] | (typeof WRITE_ACTIONS)[number];

type VercelPayload = {
  action: VercelAction;
  projectId?: string;
  deploymentId?: string;
  limit?: number;
  name?: string;
  framework?: string;
  gitRepo?: string;
  repoId?: number;
  branch?: string;
  target?: "production" | "preview";
  teamId?: string;
  _gateApproved?: boolean;
  _gateId?: string;
  missionId?: string;
};

function parseInput(raw: string): VercelPayload | { error: string } {
  const t = raw.trim();
  if (!t) return { error: "input vazio — use JSON com action" };
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const action = String(j.action ?? "");
    const allowed = [...READ_ACTIONS, ...WRITE_ACTIONS];
    if (!allowed.includes(action as VercelAction)) {
      return { error: `action inválida. Use: ${allowed.join(", ")}` };
    }
    const targetRaw = j.target ? String(j.target) : undefined;
    const target =
      targetRaw === "preview" || targetRaw === "production" ? targetRaw : undefined;

    let repoId: number | undefined;
    if (typeof j.repoId === "number" && Number.isFinite(j.repoId)) {
      repoId = j.repoId;
    } else if (typeof j.repoId === "string" && /^\d+$/.test(j.repoId.trim())) {
      repoId = Number(j.repoId.trim());
    }

    return {
      action: action as VercelAction,
      projectId: j.projectId ? String(j.projectId) : undefined,
      deploymentId: j.deploymentId ? String(j.deploymentId) : undefined,
      limit: typeof j.limit === "number" ? Math.min(30, Math.max(1, j.limit)) : 12,
      name: j.name ? String(j.name) : undefined,
      framework: j.framework ? String(j.framework) : undefined,
      gitRepo: j.gitRepo ? String(j.gitRepo) : undefined,
      repoId,
      branch: j.branch ? String(j.branch) : undefined,
      target,
      teamId: j.teamId ? String(j.teamId) : undefined,
      _gateApproved: j._gateApproved === true,
      _gateId: j._gateId ? String(j._gateId) : undefined,
      missionId: j.missionId ? String(j.missionId) : undefined,
    };
  } catch {
    return { error: "input deve ser JSON válido" };
  }
}

export async function runVercel(input: string, userId: string): Promise<ToolResult> {
  const started = Date.now();
  const parsed = parseInput(input);
  if ("error" in parsed) {
    return {
      ok: false,
      tool: "vercel",
      input,
      error: parsed.error,
      durationMs: Date.now() - started,
    };
  }

  const row = await getConnectorRow(userId, "vercel");
  if (!row || row.status !== "connected") {
    return {
      ok: false,
      tool: "vercel",
      input,
      error: "Vercel não conectado ou token indisponível. Conecte em Configurações → Conectores.",
      durationMs: Date.now() - started,
    };
  }

  const token = await getAccessToken(userId, "vercel");
  if (!token) {
    return {
      ok: false,
      tool: "vercel",
      input,
      error: "Falha ao obter token do conector Vercel.",
      durationMs: Date.now() - started,
    };
  }

  const caps = parseCapabilities(row.capabilities);
  const manifestCap = vercelManifest.capabilities.find((c) => c.name === parsed.action);
  const cap =
    caps.find((c) => c.name === parsed.action) ||
    (manifestCap
      ? {
          name: manifestCap.name,
          description: manifestCap.description,
          kind: "rest_api" as const,
          mode: manifestCap.mode,
        }
      : null);

  if (!cap) {
    return {
      ok: false,
      tool: "vercel",
      input,
      error: `Capability '${parsed.action}' não está autorizada no conector Vercel do usuário.`,
      durationMs: Date.now() - started,
    };
  }

  const isWrite =
    cap.mode === "write" ||
    WRITE_ACTIONS.includes(parsed.action as (typeof WRITE_ACTIONS)[number]);

  if (isWrite && !parsed._gateApproved) {
    const target =
      parsed.action === "project_create"
        ? `vercel.com/new/${parsed.name || "project"}`
        : `vercel.com/${parsed.name || parsed.projectId || "deploy"}`;

    let summary: string;
    if (parsed.action === "project_create") {
      summary = `Criar projeto Vercel "${parsed.name}"${parsed.gitRepo ? ` (git: ${parsed.gitRepo})` : ""}`;
    } else {
      const targetLabel =
        parsed.target === "preview" ? "preview" : "production (autodetect)";
      summary = `Criar deployment "${parsed.name || parsed.projectId}"${
        parsed.gitRepo ? ` de ${parsed.gitRepo}` : ""
      } → ${targetLabel}`;
    }

    try {
      const gate = await createWriteGate({
        userId,
        missionId: parsed.missionId ?? null,
        provider: "vercel",
        capability: parsed.action,
        target,
        summary,
        payload: {
          action: parsed.action,
          name: parsed.name,
          framework: parsed.framework,
          gitRepo: parsed.gitRepo,
          repoId: parsed.repoId,
          branch: parsed.branch,
          target: parsed.target,
          projectId: parsed.projectId,
          teamId: parsed.teamId,
        },
        contentPreview: parsed.gitRepo
          ? `git: ${parsed.gitRepo}@${parsed.branch || "main"}${
              parsed.repoId != null ? ` repoId=${parsed.repoId}` : ""
            }`
          : parsed.framework || null,
      });

      return {
        ok: true,
        tool: "vercel",
        input,
        output: [
          "GATE_PENDING",
          `gate_id: ${gate.id}`,
          `capability: ${parsed.action}`,
          `target: ${target}`,
          `summary: ${summary}`,
          "Aguardando aprovação humana no chat (Princípio 1). Não execute write sem aprovação.",
        ].join("\n"),
        durationMs: Date.now() - started,
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Falha ao criar write_gate";
      console.error("[runVercel createWriteGate error]", { action: parsed.action, input, error: reason });
      return {
        ok: false,
        tool: "vercel",
        input,
        error: `Não consegui iniciar a operação ${parsed.action}: ${reason}`,
        durationMs: Date.now() - started,
      };
    }
  }

  if (parsed.action === "project_create") {
    const res = await vercelCreateProject(token, {
      name: parsed.name || "plutao-project",
      framework: parsed.framework,
      gitRepo: parsed.gitRepo,
      teamId: parsed.teamId,
    });
    if (!res.ok) {
      return {
        ok: false,
        tool: "vercel",
        input,
        error: res.error,
        durationMs: Date.now() - started,
      };
    }
    return {
      ok: true,
      tool: "vercel",
      input,
      output: res.output,
      durationMs: Date.now() - started,
    };
  }

  if (parsed.action === "deploy_create") {
    const res = await vercelCreateDeployment(token, {
      projectName: parsed.name || String(parsed.projectId || ""),
      projectId: parsed.projectId,
      gitRepo: parsed.gitRepo,
      repoId: parsed.repoId,
      branch: parsed.branch,
      target: parsed.target,
      teamId: parsed.teamId,
    });
    if (!res.ok) {
      return {
        ok: false,
        tool: "vercel",
        input,
        error: res.error,
        durationMs: Date.now() - started,
      };
    }
    return {
      ok: true,
      tool: "vercel",
      input,
      output: res.output,
      durationMs: Date.now() - started,
    };
  }

  const args: Record<string, unknown> = {
    projectId: parsed.projectId,
    deploymentId: parsed.deploymentId,
    limit: parsed.limit ?? 12,
  };

  const res = await runRestCapability(vercelManifest, parsed.action, args, token);
  if (!res.ok) {
    return {
      ok: false,
      tool: "vercel",
      input,
      error: res.error,
      durationMs: Date.now() - started,
    };
  }

  return {
    ok: true,
    tool: "vercel",
    input,
    output: res.output,
    durationMs: Date.now() - started,
  };
}
