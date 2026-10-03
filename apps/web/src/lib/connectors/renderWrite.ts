/**
 * Render API client helper functions and write operations.
 * Operações de escrita passam obrigatoriamente por Write Gate (Princípio 1).
 */

type RenderFetchResult<T = unknown> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number };

export function maskValue(val: string): string {
  const clean = val.trim();
  if (clean.length <= 4) return "****";
  return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function renderFetch<T = unknown>(
  token: string,
  path: string,
  opts: RequestInit = {}
): Promise<RenderFetchResult<T>> {
  const cleanToken = token.trim();
  const url = `https://api.render.com/v1${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const res = await fetchWithTimeout(url, {
      ...opts,
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...opts.headers,
      },
    });

    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* plain text fallback */
    }

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      if (typeof data === "object" && data !== null) {
        const obj = data as Record<string, unknown>;
        if (typeof obj.message === "string") {
          msg = obj.message;
        } else if (typeof obj.error === "string") {
          msg = obj.error;
        }
      }
      return { ok: false, error: translateRenderError(msg, res.status), status: res.status };
    }

    return { ok: true, data: data as T, status: res.status };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: "Tempo limite excedido na comunicação com Render (15s)", status: 408 };
    }
    return {
      ok: false,
      error: e instanceof Error ? translateRenderError(e.message, 500) : "Falha ao comunicar com Render",
      status: 500,
    };
  }
}

function translateRenderError(err: string, status?: number): string {
  if (status === 401 || err.includes("Unauthorized") || err.includes("invalid token") || err.includes("Invalid API Key")) {
    return "API Key do Render inválida ou sem permissões necessárias.";
  }
  if (status === 403 || err.includes("Forbidden")) {
    return "Acesso negado. Verifique as permissões da API Key do Render.";
  }
  if (status === 404 || err.includes("Not Found")) {
    return "Serviço ou recurso não encontrado no Render.";
  }
  return err;
}

/**
 * List services (max 50)
 */
export async function renderServicesList(
  token: string
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  const res = await renderFetch<Array<Record<string, unknown>> | { services?: Array<Record<string, unknown>> }>(
    token,
    "/services?limit=50"
  );
  if (!res.ok) return { ok: false, error: res.error };

  const rawList = Array.isArray(res.data)
    ? res.data
    : Array.isArray((res.data as { services?: unknown[] })?.services)
      ? (res.data as { services: Array<Record<string, unknown>> }).services
      : [];

  if (rawList.length === 0) {
    return { ok: true, output: "Nenhum serviço encontrado nesta conta Render.", rawData: res.data };
  }

  const lines = rawList.slice(0, 50).map((item, i) => {
    const s = (item.service ?? item) as Record<string, unknown>;
    const name = String(s.name ?? "?");
    const id = String(s.id ?? "");
    const type = String(s.type ?? "service");
    const repo = String(s.repo ?? s.repoUrl ?? "—");

    const details = (s.serviceDetails ?? {}) as Record<string, unknown>;
    const url = details.url ? String(details.url) : s.url ? String(s.url) : null;

    let status = "live";
    if (s.suspended === "suspended") {
      status = "suspended";
    } else if (s.status) {
      status = String(s.status);
    }

    return [
      `${i + 1}. **${name}** · tipo: ${type} · status: ${status}`,
      `   id: \`${id}\``,
      repo !== "—" ? `   repo: ${repo}` : null,
      url ? `   url: ${url}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return {
    ok: true,
    output: `Serviços Render (${rawList.length}):\n\n${lines.join("\n\n")}`,
    rawData: res.data,
  };
}

/**
 * Get service details and env vars summary (keys only, values hidden)
 */
export async function renderServiceGet(
  token: string,
  serviceId: string
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  const cleanId = serviceId.trim();
  if (!cleanId) return { ok: false, error: "Identificador do serviço (service_id) é obrigatório." };

  const sRes = await renderFetch<Record<string, unknown>>(token, `/services/${encodeURIComponent(cleanId)}`);
  if (!sRes.ok) return { ok: false, error: sRes.error };

  const sObj = (sRes.data.service ?? sRes.data) as Record<string, unknown>;
  const name = String(sObj.name ?? "?");
  const id = String(sObj.id ?? cleanId);
  const type = String(sObj.type ?? "service");
  const repo = String(sObj.repo ?? sObj.repoUrl ?? "—");
  const details = (sObj.serviceDetails ?? {}) as Record<string, unknown>;
  const url = details.url ? String(details.url) : sObj.url ? String(sObj.url) : null;
  const createdAt = sObj.createdAt ? String(sObj.createdAt) : null;

  let status = "live";
  if (sObj.suspended === "suspended") {
    status = "suspended";
  } else if (sObj.status) {
    status = String(sObj.status);
  }

  // Fetch env-vars (keys only)
  let envKeysText = "Nenhuma variável de ambiente encontrada ou endpoint indisponível.";
  const envRes = await renderFetch<Array<Record<string, unknown>> | { envVars?: Array<Record<string, unknown>> }>(
    token,
    `/services/${encodeURIComponent(cleanId)}/env-vars`
  );

  if (envRes.ok) {
    const rawEnv = Array.isArray(envRes.data)
      ? envRes.data
      : Array.isArray((envRes.data as { envVars?: unknown[] })?.envVars)
        ? (envRes.data as { envVars: Array<Record<string, unknown>> }).envVars
        : [];

    if (rawEnv.length > 0) {
      const keys = rawEnv.map((item) => {
        const ev = (item.envVar ?? item) as Record<string, unknown>;
        return String(ev.key ?? ev.name ?? "?");
      });
      envKeysText = keys.map((k) => `- \`${k}\``).join("\n");
    } else {
      envKeysText = "Nenhuma variável de ambiente configurada.";
    }
  }

  const outputParts = [
    `Detalhes do Serviço \`${id}\``,
    `Nome: **${name}**`,
    `Tipo: ${type}`,
    `Status: ${status}`,
    repo !== "—" ? `Repositório: ${repo}` : null,
    url ? `URL Live: ${url}` : null,
    createdAt ? `Criado em: ${createdAt}` : null,
    "",
    "**Variáveis de Ambiente (Chaves Resumidas):**",
    envKeysText,
  ].filter((p) => p !== null);

  return {
    ok: true,
    output: outputParts.join("\n"),
    rawData: sRes.data,
  };
}

/**
 * List last 20 deploys of a service
 */
export async function renderDeploysList(
  token: string,
  serviceId: string
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  const cleanId = serviceId.trim();
  if (!cleanId) return { ok: false, error: "Identificador do serviço (service_id) é obrigatório." };

  const res = await renderFetch<Array<Record<string, unknown>> | { deploys?: Array<Record<string, unknown>> }>(
    token,
    `/services/${encodeURIComponent(cleanId)}/deploys?limit=20`
  );
  if (!res.ok) return { ok: false, error: res.error };

  const rawDeploys = Array.isArray(res.data)
    ? res.data
    : Array.isArray((res.data as { deploys?: unknown[] })?.deploys)
      ? (res.data as { deploys: Array<Record<string, unknown>> }).deploys
      : [];

  if (rawDeploys.length === 0) {
    return { ok: true, output: "Nenhum deploy encontrado para este serviço.", rawData: res.data };
  }

  const lines = rawDeploys.slice(0, 20).map((item, i) => {
    const d = (item.deploy ?? item) as Record<string, unknown>;
    const id = String(d.id ?? "?");
    const status = String(d.status ?? d.state ?? "desconhecido");
    const createdAt = d.createdAt ? String(d.createdAt) : "";

    const commitObj = (d.commit ?? {}) as Record<string, unknown>;
    const commitId = String(commitObj.id ?? commitObj.commitId ?? "");
    const commitMsg = String(commitObj.message ?? "");
    const commitInfo = commitId || commitMsg ? ` · commit: \`${commitId.slice(0, 7)}\`${commitMsg ? ` (${commitMsg.slice(0, 40)})` : ""}` : "";

    return `${i + 1}. **${id}** · status: ${status}${commitInfo}${createdAt ? `\n   criado: ${createdAt}` : ""}`;
  });

  return {
    ok: true,
    output: `Últimos Deploys (${rawDeploys.length}):\n\n${lines.join("\n\n")}`,
    rawData: res.data,
  };
}

/**
 * Trigger a new deploy for a service (write action, post gate approval)
 */
export async function renderDeployTrigger(
  token: string,
  opts: { serviceId: string; clearCache?: boolean }
): Promise<{ ok: true; output: string; deployId: string } | { ok: false; error: string }> {
  const cleanId = opts.serviceId.trim();
  if (!cleanId) return { ok: false, error: "Identificador do serviço (service_id) é obrigatório." };

  const body = {
    clearCache: opts.clearCache ? "clear" : "do_not_clear",
  };

  const res = await renderFetch<Record<string, unknown>>(
    token,
    `/services/${encodeURIComponent(cleanId)}/deploys`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) return { ok: false, error: res.error };

  const dep = (res.data.deploy ?? res.data) as Record<string, unknown>;
  const deployId = String(dep.id ?? "");
  const status = String(dep.status ?? "created");

  return {
    ok: true,
    deployId,
    output: [
      `Deploy disparado com sucesso!`,
      `Serviço: \`${cleanId}\``,
      `Deploy ID: \`${deployId}\``,
      `Status: ${status}`,
      `Limpar Cache: ${opts.clearCache ? "Sim" : "Não"}`,
    ].join("\n"),
  };
}

/**
 * Set an environment variable for a service (write action, post gate approval)
 */
export async function renderEnvSet(
  token: string,
  opts: { serviceId: string; key: string; value: string }
): Promise<{ ok: true; output: string } | { ok: false; error: string }> {
  const cleanId = opts.serviceId.trim();
  const cleanKey = opts.key.trim();
  if (!cleanId) return { ok: false, error: "Identificador do serviço (service_id) é obrigatório." };
  if (!cleanKey) return { ok: false, error: "Chave da variável de ambiente (key) é obrigatória." };

  const body = [
    {
      key: cleanKey,
      value: opts.value,
    },
  ];

  const res = await renderFetch<unknown>(
    token,
    `/services/${encodeURIComponent(cleanId)}/env-vars`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) return { ok: false, error: res.error };

  const masked = maskValue(opts.value);

  return {
    ok: true,
    output: [
      `Variável de ambiente definida com sucesso!`,
      `Serviço: \`${cleanId}\``,
      `Chave: \`${cleanKey}\``,
      `Valor: \`${masked}\``,
    ].join("\n"),
  };
}
