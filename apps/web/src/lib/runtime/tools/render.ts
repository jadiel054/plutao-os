/**
 * Tool render — REST via API Key do conector do usuário.
 * Reads: executam direto.
 * Writes: criam write_gate (pending) até aprovação humana; depois executam.
 */

import { getConnectorRow, getAccessToken } from "@/lib/connectors/service";
import { renderManifest } from "@/lib/connectors/manifests/render";
import { createWriteGate } from "@/lib/connectors/gates";
import {
  maskValue,
  renderServicesList,
  renderServiceGet,
  renderDeploysList,
  renderDeployTrigger,
  renderEnvSet,
} from "@/lib/connectors/renderWrite";
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

const READ_ACTIONS = ["services_list", "service_get", "deploys_list"] as const;
const WRITE_ACTIONS = ["deploy_trigger", "env_set"] as const;

type RenderAction = (typeof READ_ACTIONS)[number] | (typeof WRITE_ACTIONS)[number];

type RenderPayload = {
  action: RenderAction;
  service_id?: string;
  serviceId?: string;
  clear_cache?: boolean;
  clearCache?: boolean;
  key?: string;
  value?: string;
  _gateApproved?: boolean;
  _gateId?: string;
  missionId?: string;
};

function parseInput(raw: string): RenderPayload | { error: string } {
  const t = raw.trim();
  if (!t) return { error: "input vazio — use JSON com action" };
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const action = String(j.action ?? "");
    const allowed = [...READ_ACTIONS, ...WRITE_ACTIONS];
    if (!allowed.includes(action as RenderAction)) {
      return { error: `action inválida. Use: ${allowed.join(", ")}` };
    }

    const sId = j.service_id ? String(j.service_id) : j.serviceId ? String(j.serviceId) : undefined;
    const cCache = typeof j.clearCache === "boolean" ? j.clearCache : typeof j.clear_cache === "boolean" ? j.clear_cache : j.clear_cache === "true" || j.clearCache === "true";

    return {
      action: action as RenderAction,
      service_id: sId,
      serviceId: sId,
      clear_cache: cCache,
      clearCache: cCache,
      key: j.key ? String(j.key) : undefined,
      value: j.value !== undefined && j.value !== null ? String(j.value) : undefined,
      _gateApproved: j._gateApproved === true,
      _gateId: j._gateId ? String(j._gateId) : undefined,
      missionId: j.missionId ? String(j.missionId) : undefined,
    };
  } catch {
    return { error: "input deve ser JSON válido" };
  }
}

export async function runRender(input: string, userId: string): Promise<ToolResult> {
  const started = Date.now();
  const parsed = parseInput(input);
  if ("error" in parsed) {
    return {
      ok: false,
      tool: "render",
      input,
      error: parsed.error,
      durationMs: Date.now() - started,
    };
  }

  const row = await getConnectorRow(userId, "render");
  if (!row || row.status !== "connected") {
    return {
      ok: false,
      tool: "render",
      input,
      error: "Render não conectado ou API Key indisponível. Conecte em Configurações → Conectores.",
      durationMs: Date.now() - started,
    };
  }

  const token = await getAccessToken(userId, "render");
  if (!token) {
    return {
      ok: false,
      tool: "render",
      input,
      error: "Falha ao obter API Key do conector Render.",
      durationMs: Date.now() - started,
    };
  }

  const caps = parseCapabilities(row.capabilities);
  const manifestCap = renderManifest.capabilities.find((c) => c.name === parsed.action);
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
      tool: "render",
      input,
      error: `Capability '${parsed.action}' não está autorizada no conector Render do usuário.`,
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

    const sId = parsed.serviceId || parsed.service_id || "";

    if (parsed.action === "deploy_trigger") {
      target = `services/${sId}/deploys`;
      summary = `Disparar deploy para o serviço "${sId}"`;
      preview = [
        `Serviço ID: ${sId}`,
        `Limpar Cache: ${parsed.clearCache ? "Sim" : "Não"}`,
      ].join("\n");
    } else if (parsed.action === "env_set") {
      target = `services/${sId}/env-vars`;
      summary = `Definir variável de ambiente "${parsed.key}" no serviço "${sId}"`;
      preview = [
        `Serviço ID: ${sId}`,
        `Chave: ${parsed.key || "—"}`,
        `Valor: ${parsed.value !== undefined ? maskValue(parsed.value) : "—"}`,
      ].join("\n");
    }

    try {
      const gate = await createWriteGate({
        userId,
        missionId: parsed.missionId ?? null,
        provider: "render",
        capability: parsed.action,
        target,
        summary,
        payload: {
          action: parsed.action,
          serviceId: sId,
          clearCache: parsed.clearCache,
          key: parsed.key,
          value: parsed.value,
        },
        contentPreview: preview,
      });

      return {
        ok: true,
        tool: "render",
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
      return {
        ok: false,
        tool: "render",
        input,
        error: e instanceof Error ? e.message : "Falha ao criar write_gate",
        durationMs: Date.now() - started,
      };
    }
  }

  if (parsed.action === "services_list") {
    const res = await renderServicesList(token);
    if (!res.ok) {
      return { ok: false, tool: "render", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "render", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "service_get") {
    const sId = parsed.serviceId || parsed.service_id || "";
    if (!sId) {
      return { ok: false, tool: "render", input, error: "Parâmetro 'service_id' é obrigatório para obter detalhes do serviço.", durationMs: Date.now() - started };
    }
    const res = await renderServiceGet(token, sId);
    if (!res.ok) {
      return { ok: false, tool: "render", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "render", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "deploys_list") {
    const sId = parsed.serviceId || parsed.service_id || "";
    if (!sId) {
      return { ok: false, tool: "render", input, error: "Parâmetro 'service_id' é obrigatório para listar deploys.", durationMs: Date.now() - started };
    }
    const res = await renderDeploysList(token, sId);
    if (!res.ok) {
      return { ok: false, tool: "render", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "render", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "deploy_trigger") {
    const sId = parsed.serviceId || parsed.service_id || "";
    const res = await renderDeployTrigger(token, {
      serviceId: sId,
      clearCache: parsed.clearCache,
    });
    if (!res.ok) {
      return { ok: false, tool: "render", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "render", input, output: res.output, durationMs: Date.now() - started };
  }

  if (parsed.action === "env_set") {
    const sId = parsed.serviceId || parsed.service_id || "";
    const key = parsed.key || "";
    const value = parsed.value ?? "";
    const res = await renderEnvSet(token, {
      serviceId: sId,
      key,
      value,
    });
    if (!res.ok) {
      return { ok: false, tool: "render", input, error: res.error, durationMs: Date.now() - started };
    }
    return { ok: true, tool: "render", input, output: res.output, durationMs: Date.now() - started };
  }

  return {
    ok: false,
    tool: "render",
    input,
    error: `Action '${parsed.action}' não reconhecida.`,
    durationMs: Date.now() - started,
  };
}
