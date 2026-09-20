import type { ConnectorManifest, CapabilityManifest } from "./manifests/types";

export type RestCapabilityResult =
  | { ok: true; output: string; rawData?: unknown }
  | { ok: false; error: string };

/**
 * Generic REST Capability Executor.
 * Replaces path params ({owner}, {repo}, {projectId}, etc.), builds query/body,
 * executes HTTP request with manifest headers, and formats the output via customFormatter
 * or generic summarizer with summary.pick and summary.limit.
 */
export async function runRestCapability(
  manifest: ConnectorManifest,
  capName: string,
  args: Record<string, unknown>,
  token: string
): Promise<RestCapabilityResult> {
  const cap = manifest.capabilities.find((c) => c.name === capName);
  if (!cap) {
    return {
      ok: false,
      error: `Capability '${capName}' não encontrada no conector ${manifest.displayName}.`,
    };
  }

  if (cap.mode === "write") {
    return {
      ok: false,
      error: `Ação de escrita '${capName}' recusada: requer portão de confirmação humana (Princípio 1) ainda não implementado.`,
    };
  }

  // Validate required arguments
  if (cap.requiredArgs) {
    for (const reqArg of cap.requiredArgs) {
      if (args[reqArg] === undefined || args[reqArg] === null || args[reqArg] === "") {
        return {
          ok: false,
          error: `${capName} exige o parâmetro '${reqArg}'`,
        };
      }
    }
  }

  // Substitute path parameters
  let path = cap.request.path;
  const pathParamsMatch = path.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
  for (const match of pathParamsMatch) {
    const paramKey = match.slice(1, -1);
    const val = args[paramKey];
    if (val === undefined || val === null) {
      return {
        ok: false,
        error: `${capName} exige o parâmetro '${paramKey}' na URL`,
      };
    }
    path = path.replace(match, encodeURIComponent(String(val)));
  }

  const url = new URL(`${manifest.baseUrl.replace(/\/$/, "")}${path}`);

  // Build query parameters for GET requests
  if (cap.request.method === "GET") {
    if (cap.request.query) {
      for (const [qKey, qTpl] of Object.entries(cap.request.query)) {
        if (qTpl.startsWith("{") && qTpl.endsWith("}")) {
          const paramKey = qTpl.slice(1, -1);
          const val = args[paramKey];
          if (val !== undefined && val !== null && val !== "") {
            url.searchParams.set(qKey, String(val));
          }
        } else {
          url.searchParams.set(qKey, qTpl);
        }
      }
    }

    // Pass additional args as query params if not already set or matched
    for (const [aKey, aVal] of Object.entries(args)) {
      if (
        aVal !== undefined &&
        aVal !== null &&
        aVal !== "" &&
        !cap.requiredArgs?.includes(aKey) &&
        !url.searchParams.has(aKey)
      ) {
        if (typeof aVal === "string" || typeof aVal === "number" || typeof aVal === "boolean") {
          url.searchParams.set(aKey, String(aVal));
        }
      }
    }
  }

  const headers = manifest.headers
    ? manifest.headers(token)
    : { Authorization: `Bearer ${token}` };

  let reqBody: string | undefined = undefined;
  if (cap.request.method !== "GET") {
    if (cap.request.body) {
      reqBody = JSON.stringify(cap.request.body);
    } else {
      reqBody = JSON.stringify(args);
    }
  }

  try {
    const res = await fetch(url.toString(), {
      method: cap.request.method,
      headers,
      body: reqBody,
    });

    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* plain text fallback */
    }

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      if (typeof data === "object" && data !== null) {
        const obj = data as Record<string, unknown>;
        if (typeof obj.message === "string") errMsg = obj.message;
        else if (typeof obj.error === "string") errMsg = obj.error;
        else if (typeof obj.error === "object" && obj.error !== null && "message" in obj.error) {
          errMsg = String((obj.error as { message?: unknown }).message);
        }
      }
      return { ok: false, error: errMsg };
    }

    const output = formatCapabilityOutput(cap, data);
    return { ok: true, output, rawData: data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro na requisição da capability",
    };
  }
}

export function formatCapabilityOutput(cap: CapabilityManifest, data: unknown): string {
  if (cap.summary?.customFormatter) {
    return cap.summary.customFormatter(data);
  }

  const limit = cap.summary?.limit ?? 15;
  const pick = cap.summary?.pick;

  if (Array.isArray(data)) {
    const sliced = data.slice(0, limit);
    const lines = sliced.map((item, idx) => {
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (pick && pick.length > 0) {
          const pickedObj = pick.map((k) => `${k}: ${obj[k] ?? "—"}`).join(" · ");
          return `${idx + 1}. ${pickedObj}`;
        }
        return `${idx + 1}. ${JSON.stringify(obj)}`;
      }
      return `${idx + 1}. ${String(item)}`;
    });
    return `${cap.name} (${data.length}${data.length > limit ? `, mostrando ${limit}` : ""}):\n${lines.join("\n")}`;
  }

  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    if (pick && pick.length > 0) {
      const lines = pick.map((k) => `${k}: ${obj[k] ?? "—"}`);
      return lines.join("\n");
    }
    return JSON.stringify(data, null, 2).slice(0, 2500);
  }

  return String(data).slice(0, 2500);
}
