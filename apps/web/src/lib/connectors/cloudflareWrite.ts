/**
 * Cloudflare API client helper functions and write operations.
 * Operações de escrita passam obrigatoriamente por Write Gate (Princípio 1).
 */

type CloudflareFetchResult<T = unknown> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number };

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

async function cfFetch<T = unknown>(
  token: string,
  path: string,
  opts: RequestInit = {}
): Promise<CloudflareFetchResult<T>> {
  const cleanToken = token.trim();
  const url = `https://api.cloudflare.com/client/v4${path.startsWith("/") ? path : `/${path}`}`;

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
        if (Array.isArray(obj.errors) && obj.errors.length > 0) {
          const firstErr = obj.errors[0] as { message?: string; code?: number };
          if (firstErr?.message) msg = firstErr.message;
        } else if (typeof obj.message === "string") {
          msg = obj.message;
        }
      }
      return { ok: false, error: translateCloudflareError(msg), status: res.status };
    }

    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      if (obj.success === false) {
        let msg = "Erro na requisição da API Cloudflare";
        if (Array.isArray(obj.errors) && obj.errors.length > 0) {
          const firstErr = obj.errors[0] as { message?: string; code?: number };
          if (firstErr?.message) msg = firstErr.message;
        }
        return { ok: false, error: translateCloudflareError(msg), status: res.status };
      }
    }

    return { ok: true, data: data as T, status: res.status };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: "Tempo limite excedido na comunicação com Cloudflare (15s)", status: 408 };
    }
    return {
      ok: false,
      error: e instanceof Error ? translateCloudflareError(e.message) : "Falha ao comunicar com Cloudflare",
      status: 500,
    };
  }
}

function translateCloudflareError(err: string): string {
  if (err.includes("Authentication error") || err.includes("invalid token") || err.includes("Invalid API Token")) {
    return "API Token do Cloudflare inválido ou sem permissões necessárias.";
  }
  if (err.includes("zone_id") || err.includes("Invalid zone identifier")) {
    return "Identificador de zona (zone_id) inválido ou não encontrado.";
  }
  if (err.includes("account_id") || err.includes("Invalid account identifier")) {
    return "Identificador de conta (account_id) inválido ou não encontrado.";
  }
  return err;
}

/**
 * Resolves accountId automatically via GET /accounts?per_page=1
 */
export async function cloudflareGetAccountId(token: string): Promise<string | null> {
  const res = await cfFetch<{ result?: Array<{ id: string }> }>(token, "/accounts?per_page=1");
  if (!res.ok) return null;
  const list = res.data.result;
  if (Array.isArray(list) && list[0]?.id) {
    return list[0].id;
  }
  return null;
}

/**
 * List zones/domains (max 50)
 */
export async function cloudflareListZones(
  token: string
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  const res = await cfFetch<{ result?: Array<Record<string, unknown>> }>(token, "/zones?per_page=50");
  if (!res.ok) return { ok: false, error: res.error };

  const list = Array.isArray(res.data.result) ? res.data.result.slice(0, 50) : [];
  if (list.length === 0) {
    return { ok: true, output: "Nenhuma zona/domínio encontrado nesta conta Cloudflare.", rawData: res.data };
  }

  const lines = list.map((z, i) => {
    const name = String(z.name ?? "?");
    const id = String(z.id ?? "");
    const status = String(z.status ?? "ativo");
    return `${i + 1}. **${name}** · status: ${status}\n   id: \`${id}\``;
  });

  return {
    ok: true,
    output: `Zonas/Domínios Cloudflare (${list.length}):\n\n${lines.join("\n\n")}`,
    rawData: res.data,
  };
}

/**
 * List DNS records for a specific zone (max 50)
 */
export async function cloudflareListDnsRecords(
  token: string,
  zoneId: string
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  const cleanZoneId = zoneId.trim();
  if (!cleanZoneId) return { ok: false, error: "Identificador de zona (zone_id) é obrigatório." };

  const res = await cfFetch<{ result?: Array<Record<string, unknown>> }>(
    token,
    `/zones/${encodeURIComponent(cleanZoneId)}/dns_records?per_page=50`
  );
  if (!res.ok) return { ok: false, error: res.error };

  const list = Array.isArray(res.data.result) ? res.data.result.slice(0, 50) : [];
  if (list.length === 0) {
    return { ok: true, output: "Nenhum registro DNS encontrado nesta zona.", rawData: res.data };
  }

  const lines = list.map((r, i) => {
    const type = String(r.type ?? "A");
    const name = String(r.name ?? "?");
    const content = String(r.content ?? "");
    const proxied = Boolean(r.proxied);
    const id = String(r.id ?? "");
    return `${i + 1}. **${type}** \`${name}\` → \`${content}\` · proxied: ${proxied ? "sim" : "não"}\n   id: \`${id}\``;
  });

  return {
    ok: true,
    output: `Registros DNS (${list.length}):\n\n${lines.join("\n\n")}`,
    rawData: res.data,
  };
}

/**
 * List Cloudflare Pages projects (max 50)
 */
export async function cloudflareListPagesProjects(
  token: string
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  const accountId = await cloudflareGetAccountId(token);
  if (!accountId) {
    return { ok: false, error: "Não foi possível identificar a conta do Cloudflare para listar projetos do Pages." };
  }

  const res = await cfFetch<{ result?: Array<Record<string, unknown>> }>(
    token,
    `/accounts/${encodeURIComponent(accountId)}/pages/projects?per_page=50`
  );
  if (!res.ok) return { ok: false, error: res.error };

  const list = Array.isArray(res.data.result) ? res.data.result.slice(0, 50) : [];
  if (list.length === 0) {
    return { ok: true, output: "Nenhum projeto do Cloudflare Pages encontrado nesta conta.", rawData: res.data };
  }

  const lines = list.map((p, i) => {
    const name = String(p.name ?? "?");
    const subdomain = String(p.subdomain ?? `${name}.pages.dev`);
    const created = p.created_on ? String(p.created_on) : "";
    return `${i + 1}. **${name}**\n   url: https://${subdomain}${created ? ` · criado: ${created}` : ""}`;
  });

  return {
    ok: true,
    output: `Projetos Cloudflare Pages (${list.length}):\n\n${lines.join("\n\n")}`,
    rawData: res.data,
  };
}

/**
 * List Cloudflare Workers scripts (max 50)
 */
export async function cloudflareListWorkers(
  token: string
): Promise<{ ok: true; output: string; rawData: unknown } | { ok: false; error: string }> {
  const accountId = await cloudflareGetAccountId(token);
  if (!accountId) {
    return { ok: false, error: "Não foi possível identificar a conta do Cloudflare para listar os Workers." };
  }

  const res = await cfFetch<{ result?: Array<Record<string, unknown>> }>(
    token,
    `/accounts/${encodeURIComponent(accountId)}/workers/scripts?per_page=50`
  );
  if (!res.ok) return { ok: false, error: res.error };

  const list = Array.isArray(res.data.result) ? res.data.result.slice(0, 50) : [];
  if (list.length === 0) {
    return { ok: true, output: "Nenhum Worker encontrado nesta conta Cloudflare.", rawData: res.data };
  }

  const lines = list.map((w, i) => {
    const id = String(w.id ?? w.name ?? "?");
    const modified = w.modified_on ? String(w.modified_on) : "";
    return `${i + 1}. **${id}**${modified ? ` · modificado: ${modified}` : ""}`;
  });

  return {
    ok: true,
    output: `Workers (${list.length}):\n\n${lines.join("\n\n")}`,
    rawData: res.data,
  };
}

/**
 * Create a DNS record in a zone (write action, post gate approval)
 */
export async function cloudflareCreateDnsRecord(
  token: string,
  opts: {
    zoneId: string;
    type: string;
    name: string;
    content: string;
    proxied?: boolean;
  }
): Promise<{ ok: true; output: string; recordId: string } | { ok: false; error: string }> {
  const cleanZoneId = opts.zoneId.trim();
  if (!cleanZoneId) return { ok: false, error: "Identificador de zona (zone_id) é obrigatório." };
  if (!opts.type) return { ok: false, error: "Tipo de registro DNS (type) é obrigatório (ex: A, CNAME, TXT)." };
  if (!opts.name) return { ok: false, error: "Nome do registro DNS (name) é obrigatório." };
  if (!opts.content) return { ok: false, error: "Conteúdo do registro DNS (content) é obrigatório." };

  const body = {
    type: opts.type.toUpperCase().trim(),
    name: opts.name.trim(),
    content: opts.content.trim(),
    proxied: Boolean(opts.proxied),
  };

  const res = await cfFetch<{ result?: Record<string, unknown> }>(
    token,
    `/zones/${encodeURIComponent(cleanZoneId)}/dns_records`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) return { ok: false, error: res.error };

  const record = res.data.result ?? {};
  const recordId = String(record.id ?? "");

  return {
    ok: true,
    recordId,
    output: [
      `Registro DNS criado com sucesso!`,
      `ID: \`${recordId}\``,
      `Tipo: ${body.type}`,
      `Nome: ${body.name}`,
      `Conteúdo: ${body.content}`,
      `Proxied: ${body.proxied ? "Sim" : "Não"}`,
    ].join("\n"),
  };
}

/**
 * Deploy Cloudflare Pages project (write action, post gate approval)
 */
export async function cloudflareDeployPages(
  token: string,
  opts: {
    projectName: string;
    branch?: string;
  }
): Promise<{ ok: true; output: string; deploymentId: string; url?: string } | { ok: false; error: string }> {
  const cleanProjectName = opts.projectName.trim();
  if (!cleanProjectName) return { ok: false, error: "Nome do projeto do Cloudflare Pages (project_name) é obrigatório." };

  const accountId = await cloudflareGetAccountId(token);
  if (!accountId) {
    return { ok: false, error: "Não foi possível identificar a conta do Cloudflare para realizar o deploy do Pages." };
  }

  const branch = (opts.branch || "main").trim();
  const body = { branch };

  const res = await cfFetch<{ result?: Record<string, unknown> }>(
    token,
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(cleanProjectName)}/deployments`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) return { ok: false, error: res.error };

  const dep = res.data.result ?? {};
  const deploymentId = String(dep.id ?? "");
  const url = dep.url ? String(dep.url) : undefined;

  return {
    ok: true,
    deploymentId,
    url,
    output: [
      `Deployment do Pages iniciado com sucesso!`,
      `Projeto: ${cleanProjectName}`,
      `Deployment ID: \`${deploymentId}\``,
      `Branch: ${branch}`,
      url ? `URL: ${url}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
