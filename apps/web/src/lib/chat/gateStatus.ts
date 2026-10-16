import { sanitizeText } from "@/lib/security/sanitize";

export type GateUiStatus =
  | "GATE_PENDING"
  | "approved"
  | "executing"
  | "executed"
  | "failed"
  | "rejected"
  | "ok"
  | "error";

export type WriteGateMinimalRow = {
  id: string;
  status: string;
  expiresAt?: Date | string | null;
  result?: unknown;
  error?: string | null;
};

/**
 * Extrai o gate_id UUID de um texto apenas se contiver a marca GATE_PENDING.
 */
export function extractGateId(text: string | null | undefined): string | null {
  if (!text || !text.includes("GATE_PENDING")) return null;
  const match = text.match(
    /gate_id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match?.[1] ?? null;
}

/**
 * Mapeia a linha do banco `write_gates` e a data/hora atual para o status da UI e summaryOutput.
 */
export function mapGateStatusToUi(
  row: WriteGateMinimalRow,
  now: Date = new Date()
): { status: GateUiStatus; summaryOutput?: string } {
  const dbStatus = row.status;
  const expiresAt = row.expiresAt ? new Date(row.expiresAt) : null;

  if (dbStatus === "pending") {
    if (expiresAt && expiresAt.getTime() <= now.getTime()) {
      return {
        status: "failed",
        summaryOutput: "Aprovação expirada.",
      };
    }
    return { status: "GATE_PENDING" };
  }

  if (dbStatus === "approved") {
    return { status: "approved", summaryOutput: "Gate aprovado. Executando..." };
  }

  if (dbStatus === "executing") {
    return { status: "executing", summaryOutput: "Executando..." };
  }

  if (dbStatus === "executed") {
    let output = "Executado com sucesso.";
    if (row.result && typeof row.result === "object") {
      const resObj = row.result as Record<string, unknown>;
      if (typeof resObj.output === "string" && resObj.output.trim()) {
        output = sanitizeText(resObj.output).slice(0, 300);
      }
    }
    return { status: "executed", summaryOutput: output };
  }

  if (dbStatus === "failed") {
    const errorMsg = row.error ? sanitizeText(row.error) : "Execução falhou.";
    return { status: "failed", summaryOutput: errorMsg };
  }

  if (dbStatus === "rejected") {
    return { status: "rejected", summaryOutput: "Recusado pelo usuário." };
  }

  return { status: dbStatus as GateUiStatus };
}

export type NormalizeToolCallTarget = {
  status: string;
  summaryOutput?: string;
  fullOutput?: unknown;
  gateId?: string;
  [key: string]: unknown;
};

/**
 * Se o tool call possui status "ok" mas seu output contém um GATE_PENDING,
 * normaliza o status para "GATE_PENDING" e anexa o `gateId`.
 */
export function normalizeToolCallGate<T extends NormalizeToolCallTarget>(tc: T): T {
  const outText =
    (typeof tc.fullOutput === "string" ? tc.fullOutput : "") ||
    (tc.summaryOutput ? String(tc.summaryOutput) : "");

  const gateId = extractGateId(outText);

  if (gateId) {
    return {
      ...tc,
      status: "GATE_PENDING",
      gateId,
    };
  }

  return tc;
}
