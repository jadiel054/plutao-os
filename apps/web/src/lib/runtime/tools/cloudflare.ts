/**
 * Tool cloudflare — REST via API Token do conector do usuário.
 * Reads: executam direto.
 * Writes: criam write_gate (pending) até aprovação humana; depois executam.
 */

import { getConnectorRow, getAccessToken } from "@/lib/connectors/service";
import { cloudflareManifest } from "@/lib/connectors/manifests/cloudflare";
import { createWriteGate } from "@/lib/connectors/gates";
import {
  cloudflareListZones,
  cloudflareListDnsRecords,
  cloudflareListPagesProjects,
  cloudflareListWorkers,
  cloudflareCreateDnsRecord,
  cloudflareDeployPages,
} from "@/lib/connectors/cloudflareWrite";
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

const READ_ACTIONS = [
  "zones_list",
  "dns_records_list",
  "pages_projects_list",
  "workers_list",
] as const;

const WRITE_ACTIONS = ["dns_record_create", "pages_deploy"] as const;

type CloudflareAction = (typeof READ_ACTIONS)[number] | (typeof WRITE_ACTIONS)[number];

type CloudflarePayload = {
  action: CloudflareAction;
  zone_id?: string;
  zoneId?: string;
  type?: string;
  name?: string;
  content?: string;
  proxied?: boolean;
  project_name?: string;
  projectName?: string;
  branch?: string;
  _gateApproved?: boolean;
  _gateId?: string;
  missionId?: string;
};

function parseInput(raw: string): CloudflarePayload | { error: string } {
  const t = raw.trim();
  if (!t) return { error: "input vazio — use JSON com action" };
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const action = String(j.action ?? "");
    const allowed = [...READ_ACTIONS, ...WRITE_ACTIONS];
    if (!allowed.includes(action as CloudflareAction)) {
      return { error: `action inválida. Use: ${allowed.join(", ")}` };
    }

    return {
      action: action as CloudflareAction,
      zone_id: j.zone_id ? String(j.zone_id) : j.zoneId ? String(j.zoneId) : undefined,
      zoneId: j.zoneId ? String(j.zoneId) : j.zone_id ? String(j.zone_id) : undefined,
      type: j.type ? String(j.type) : undefined,
      name: j.name ? String(j.name) : undefined,
      content: j.content ? String(j.content) : undefined,
      proxied: typeof j.proxied === "boolean" ? j.proxied : j.proxied === "true",
      project_name: j.project_name ? String(j.project_name) : j.projectName ? String(j.projectName) : undefined,
      projectName: j.projectName ? String(j.projectName) : j.project_name ? String(j.project_name) : undefined,
      branch: j.branch ? String(j.branch) : undefined,
      _gateApproved: j._gateApproved === true,
      _gateId: j._gateId ? String(j._gateId) : undefined,
      missionId: j.missionId ? String(j.missionId) : undefined,
    };
  } catch {
    return { error: "input deve ser JSON válido" };
  }
}

export async function runCloudflare(input: string, userId: string): Promise<ToolResult> {
  const started = Date.now();
  const parsed = parseInput(input);
  if ("error" in parsed) {
    return {
      ok: false,
      tool: "cloudflare",
      input,
      error: parsed.error,
      durationMs: Date.now() - started,
    };
  }

  const row = await getConnectorRow(userId, "cloudflare");
  if (!row || row.status !== "connected") {
    return {
      ok: false,
      tool: "cloudflare",
      input,
      error: "Cloudflare não conectado ou token indisponível. Conecte em Configurações → Conectores.",
      durationMs: Date.now() - started,
    };
  }

  const token = await getAccessToken(userId, "cloudflare");
  if (!token) {
    return {
      ok: false,
      tool: "cloudflare",
      input,
      error: "Falha ao obter token do conector Cloudflare.",
      durationMs: Date.now() - started,
    };
  }

  const caps = parseCapabilities(row.capabilities);
  const manifestCap = cloudflareManifest.capabilities.find((c) => c.name === parsed.action);
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
      tool: "cloudflare",
      input,
      error: `Capability '${parsed.action}' não está autorizada no conector Cloudflare do usuário.`,
      durationMs: Date.now() - started,
    };
  }

  const isWrite =
    cap.mode === "write" ||
    WRITE_ACTIONS.includes(parsed.action as (typeof WRITE_ACTIONS)[number]);

  if (isWrite && !parsed._gateApproved) {
    let target = "";
    let summary = "";
    let preview = "";

    if (parsed.action === "dns_record_create") {
      const zoneId = parsed.zoneId || parsed.zone_id || "";
      target = `zones/${zoneId}/dns_records`;
      summary = `Criar registro DNS ${parsed.type || "A"} "${parsed.name}" → "${parsed.content}"`;
      preview = [
        `Zone ID: ${zoneId}`,
        `Tipo: ${parsed.type || "A"}`,
        `Nome: ${parsed.name || "—"}`,
        `Conteúdo: ${parsed.content || "—"}`,
        `Proxied: ${parsed.proxied ? "Sim" : "Não"}`,
      ].join("\n");
    } else if (parsed.action === "pages_deploy") {
      const projName = parsed.projectName || parsed.project_name || "";
      target = `pages/projects/${projName}/deployments`;
      summary = `Criar deployment do Pages "${projName}" (branch: ${parsed.branch || "main"})`;
      preview = [
        `Projeto: ${projName}`,
        `Branch: ${parsed.branch || "main"}`,
      ].join("\n");
    }

    try {
      const gate = await createWriteGate({
        userId,
        missionId: parsed.missionId ?? null,
        provider: "cloudflare",
        capability: parsed.action,
        target,
        summary,
        payload: {
          action: parsed.action,
          zoneId: parsed.zoneId || parsed.zone_id,
          type: parsed.type,
          name: parsed.name,
          content: parsed.content,
          proxied: parsed.proxied,
          projectName: parsed.projectName || parsed.project_name,
          branch: parsed.branch,
        },
        contentPreview: preview,
      });

      return {
        ok: true,
        tool: "cloudflare",
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
      console.error("[runCloudflare createWriteGate error]", { action: parsed.action, input, error: reason });
      return {
        ok: false,
        tool: "cloudflare",
        input,
        error: `Não consegui iniciar a operação ${parsed.action}: ${reason}`,
        durationMs: Date.now() - started,
      };
    }
  }

  if (parsed.action === "zones_list") {
    const res = await cloudflareListZones(token);
    if (!res.ok) {
      return { ok: false, tool: "cloudflare", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "cloudflare", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "dns_records_list") {
    const zoneId = parsed.zoneId || parsed.zone_id || "";
    if (!zoneId) {
      return { ok: false, tool: "cloudflare", input, error: "Parâmetro 'zone_id' é obrigatório para listar registros DNS.", durationMs: Date.now() - started };
    }
    const res = await cloudflareListDnsRecords(token, zoneId);
    if (!res.ok) {
      return { ok: false, tool: "cloudflare", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "cloudflare", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "pages_projects_list") {
    const res = await cloudflareListPagesProjects(token);
    if (!res.ok) {
      return { ok: false, tool: "cloudflare", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "cloudflare", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "workers_list") {
    const res = await cloudflareListWorkers(token);
    if (!res.ok) {
      return { ok: false, tool: "cloudflare", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "cloudflare", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "dns_record_create") {
    const zoneId = parsed.zoneId || parsed.zone_id || "";
    const res = await cloudflareCreateDnsRecord(token, {
      zoneId,
      type: parsed.type || "A",
      name: parsed.name || "",
      content: parsed.content || "",
      proxied: parsed.proxied,
    });
    if (!res.ok) {
      return { ok: false, tool: "cloudflare", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "cloudflare", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "pages_deploy") {
    const projName = parsed.projectName || parsed.project_name || "";
    const res = await cloudflareDeployPages(token, {
      projectName: projName,
      branch: parsed.branch,
    });
    if (!res.ok) {
      return { ok: false, tool: "cloudflare", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "cloudflare", input, output: res.output, durationMs: Date.now() - started };
  }

  return {
    ok: false,
    tool: "cloudflare",
    input,
    error: `Action '${parsed.action}' não reconhecida.`,
    durationMs: Date.now() - started,
  };
}
