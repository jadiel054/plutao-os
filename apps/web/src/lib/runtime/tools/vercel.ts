import { getAccessToken } from "@/lib/connectors/service";
import { runRestCapability } from "@/lib/connectors/runRestCapability";
import { vercelManifest } from "@/lib/connectors/manifests/vercel";

type VercelAction = "projects_list" | "deployments_list" | "deployment_get";

type VercelPayload = {
  action: VercelAction;
  projectId?: string;
  deploymentId?: string;
  limit?: number;
};

function parseInput(raw: string): VercelPayload | { error: string } {
  const t = raw.trim();
  if (!t) return { error: "input vazio — use JSON com action" };
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const action = String(j.action ?? "");
    const allowed: VercelAction[] = ["projects_list", "deployments_list", "deployment_get"];
    if (!allowed.includes(action as VercelAction)) {
      return { error: `action inválida. Use: ${allowed.join(", ")}` };
    }
    return {
      action: action as VercelAction,
      projectId: j.projectId ? String(j.projectId) : undefined,
      deploymentId: j.deploymentId ? String(j.deploymentId) : undefined,
      limit: typeof j.limit === "number" ? Math.min(30, Math.max(1, j.limit)) : 12,
    };
  } catch {
    return { error: "input deve ser JSON válido" };
  }
}

/**
 * Executor REST Vercel — só roda se o conector estiver connected e token cifrado existir.
 */
export async function runVercel(
  rawInput: string,
  userId: string
): Promise<{ ok: true; output: string; durationMs: number } | { ok: false; error: string; durationMs: number }> {
  const started = Date.now();
  const token = await getAccessToken(userId, "vercel");
  if (!token) {
    return {
      ok: false,
      error: "Conector Vercel desconectado ou token indisponível. Conecte em Configurações → Conectores.",
      durationMs: Date.now() - started,
    };
  }

  const parsed = parseInput(rawInput);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error, durationMs: Date.now() - started };
  }

  const args: Record<string, unknown> = {
    projectId: parsed.projectId,
    deploymentId: parsed.deploymentId,
    limit: parsed.limit ?? 12,
  };

  const res = await runRestCapability(vercelManifest, parsed.action, args, token);

  if (!res.ok) {
    return { ok: false, error: res.error, durationMs: Date.now() - started };
  }

  return { ok: true, output: res.output, durationMs: Date.now() - started };
}
