import { getAccessToken } from "@/lib/connectors/service";

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

async function vercelFetch(
  token: string,
  path: string
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errObj = (data as { error?: { message?: string } }).error;
    return {
      ok: false,
      error: String(errObj?.message || `vercel_${res.status}`),
    };
  }
  return { ok: true, data };
}

function formatProjects(data: unknown): string {
  const root = data as { projects?: unknown[] };
  const list = Array.isArray(root.projects) ? root.projects : Array.isArray(data) ? data : [];
  if (list.length === 0) return "Nenhum projeto encontrado nesta conta Vercel.";
  const lines = list.slice(0, 20).map((p, i) => {
    const row = p as Record<string, unknown>;
    const name = String(row.name ?? row.id ?? "?");
    const id = String(row.id ?? "");
    const framework = row.framework ? String(row.framework) : "—";
    const updated = row.updatedAt ? String(row.updatedAt) : "";
    return `${i + 1}. **${name}**\n   id: \`${id}\` · framework: ${framework}${updated ? ` · updated: ${updated}` : ""}`;
  });
  return `Projetos Vercel (${list.length}):\n\n${lines.join("\n\n")}`;
}

function formatDeployments(data: unknown): string {
  const root = data as { deployments?: unknown[] };
  const list = Array.isArray(root.deployments) ? root.deployments : [];
  if (list.length === 0) return "Nenhum deployment encontrado.";
  const lines = list.slice(0, 15).map((d, i) => {
    const row = d as Record<string, unknown>;
    const uid = String(row.uid ?? row.id ?? "?");
    const name = String(row.name ?? "");
    const state = String(row.state ?? row.readyState ?? "?");
    const url = row.url ? `https://${row.url}` : "";
    return `${i + 1}. **${name || uid}** · ${state}${url ? `\n   ${url}` : ""}\n   id: \`${uid}\``;
  });
  return `Deployments (${list.length}):\n\n${lines.join("\n\n")}`;
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

  try {
    if (parsed.action === "projects_list") {
      const res = await vercelFetch(token, `/v9/projects?limit=${parsed.limit ?? 12}`);
      if (!res.ok) return { ok: false, error: res.error, durationMs: Date.now() - started };
      return { ok: true, output: formatProjects(res.data), durationMs: Date.now() - started };
    }

    if (parsed.action === "deployments_list") {
      const q = new URLSearchParams({ limit: String(parsed.limit ?? 12) });
      if (parsed.projectId) q.set("projectId", parsed.projectId);
      const res = await vercelFetch(token, `/v6/deployments?${q.toString()}`);
      if (!res.ok) return { ok: false, error: res.error, durationMs: Date.now() - started };
      return { ok: true, output: formatDeployments(res.data), durationMs: Date.now() - started };
    }

    if (parsed.action === "deployment_get") {
      if (!parsed.deploymentId) {
        return { ok: false, error: "deployment_get exige deploymentId", durationMs: Date.now() - started };
      }
      const res = await vercelFetch(token, `/v13/deployments/${encodeURIComponent(parsed.deploymentId)}`);
      if (!res.ok) return { ok: false, error: res.error, durationMs: Date.now() - started };
      const row = res.data as Record<string, unknown>;
      const output = [
        `Deployment \`${row.uid ?? row.id}\``,
        `Nome: ${row.name ?? "—"}`,
        `Estado: ${row.readyState ?? row.state ?? "—"}`,
        row.url ? `URL: https://${row.url}` : null,
        row.createdAt ? `Criado: ${row.createdAt}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return { ok: true, output, durationMs: Date.now() - started };
    }

    return { ok: false, error: "action não implementada", durationMs: Date.now() - started };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "erro_vercel",
      durationMs: Date.now() - started,
    };
  }
}
