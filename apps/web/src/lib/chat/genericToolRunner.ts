import { CONNECTOR_MANIFESTS } from "@/lib/connectors/manifests";
import type { CapabilityManifest, ConnectorManifest } from "@/lib/connectors/manifests/types";
import { runRestCapability } from "@/lib/connectors/runRestCapability";
import { getAccessToken } from "@/lib/connectors/service";
import { getDb } from "@/lib/db";
import { missions } from "@plutao/db";
import { eq, and } from "drizzle-orm";
import { parseEvidence, type EvidenceItem } from "@/lib/missions/ownership";
import type { ConnectorProviderId } from "@plutao/domain";

export type GenericToolTrace = {
  id: string;
  provider: ConnectorProviderId;
  capability: string;
  input: Record<string, unknown> | string;
  output: string;
  status: "ok" | "error";
  durationMs: number;
  timestamp: string;
};

export type GenericToolExecutionResult = {
  executed: boolean;
  missingArgs?: boolean;
  provider?: ConnectorProviderId;
  capability?: string;
  trace?: GenericToolTrace;
  contextText?: string;
  suggestedFollowUps?: Array<{ id: string; label: string; prompt: string }>;
};

type MatchedIntent = {
  manifest: ConnectorManifest;
  capability: CapabilityManifest;
  args: Record<string, unknown>;
  missingParams: string[];
};

export function detectCapabilityIntent(text: string, defaultAccountLogin?: string | null): MatchedIntent | null {
  const t = text.toLowerCase();

  for (const manifest of Object.values(CONNECTOR_MANIFESTS)) {
    const isProviderMatch =
      t.includes(manifest.provider) ||
      t.includes(manifest.displayName.toLowerCase());

    for (const cap of manifest.capabilities) {
      const keywordMatches = cap.intentKeywords?.some((kw) => t.includes(kw.toLowerCase()));

      if (isProviderMatch || keywordMatches) {
        // Extract parameters from user text
        const extractedArgs: Record<string, unknown> = {};

        // Extract owner/repo
        const fullRepoMatch = text.match(/\b([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\b/);
        if (fullRepoMatch) {
          extractedArgs.owner = fullRepoMatch[1];
          extractedArgs.repo = fullRepoMatch[2];
        } else {
          const singleRepoMatch = text.match(/(?:repositório|repo)\s+([a-zA-Z0-9_.-]+)/i);
          if (singleRepoMatch) {
            extractedArgs.repo = singleRepoMatch[1];
          }
          if (defaultAccountLogin && !extractedArgs.owner) {
            extractedArgs.owner = defaultAccountLogin;
          }
        }

        // Extract number (issue number)
        const numberMatch = text.match(/(?:issue|pr|pull|#)\s*#?(\d+)/i);
        if (numberMatch) {
          extractedArgs.number = parseInt(numberMatch[1], 10);
        }

        // Extract projectId / project name
        const projMatch = text.match(/(?:projeto|project)\s+([a-zA-Z0-9_.-]+)/i);
        if (projMatch) {
          extractedArgs.projectId = projMatch[1];
        }

        // Extract branchId
        const branchMatch = text.match(/branch\s+([a-zA-Z0-9_.-]+)/i);
        if (branchMatch) {
          extractedArgs.branchId = branchMatch[1];
        }

        // Extract deploymentId
        const depMatch = text.match(/deployment\s+([a-zA-Z0-9_.-]+)/i);
        if (depMatch) {
          extractedArgs.deploymentId = depMatch[1];
        }

        // Check required arguments
        const reqs = cap.requiredArgs ?? [];
        const missing = reqs.filter((r) => extractedArgs[r] === undefined || extractedArgs[r] === "");

        // Verify if capability matches specific action intent
        if (keywordMatches || isProviderMatch) {
          return {
            manifest,
            capability: cap,
            args: extractedArgs,
            missingParams: missing,
          };
        }
      }
    }
  }

  return null;
}

export async function detectAndExecuteGenericTool(opts: {
  text: string;
  userId: string;
  missionId?: string | null;
}): Promise<GenericToolExecutionResult> {
  const intent = detectCapabilityIntent(opts.text);
  if (!intent) {
    return { executed: false };
  }

  const { manifest, capability, args, missingParams } = intent;

  const token = await getAccessToken(opts.userId, manifest.provider);
  if (!token) {
    return {
      executed: false,
      contextText: `[CONECTOR ${manifest.displayName.toUpperCase()} DESCONECTADO]
O usuário solicitou uma ação no ${manifest.displayName}, mas o conector não está ativo.
Oriente o usuário a conectar em Configurações → Conectores.`,
    };
  }

  // Handle missing parameters with silent list lookup + clarification prompt
  if (missingParams.length > 0) {
    const recentOptions: string[] = [];
    try {
      const listCap = manifest.capabilities.find((c) => c.name.endsWith("_list"));
      if (listCap) {
        const silentRes = await runRestCapability(manifest, listCap.name, {}, token);
        if (silentRes.ok && silentRes.output) {
          const lines = silentRes.output.split("\n");
          for (const l of lines) {
            const m = l.match(/\*\*([^*]+)\*\*/) || l.match(/-\s*([^\s]+)/);
            if (m && m[1]) recentOptions.push(m[1].trim());
            if (recentOptions.length >= 3) break;
          }
        }
      }
    } catch {
      /* ignore silent fetch error */
    }

    const followUps = recentOptions.map((opt, i) => ({
      id: `fu-${manifest.provider}-${i + 1}`,
      label: opt,
      prompt: `consultar ${capability.name} de ${opt}`,
    }));

    const contextText = `[ESCLARECIMENTO DE PARÂMETROS - ${manifest.displayName.toUpperCase()}]
O usuário solicitou '${capability.name}', mas os parâmetros [${missingParams.join(", ")}] não foram informados.
Opções recentes disponíveis: ${recentOptions.length > 0 ? recentOptions.join(", ") : "nenhuma encontrada"}.
Pergunte objetivamente qual recurso o usuário deseja consultar, apresentando as opções se houver.`;

    return {
      executed: false,
      missingArgs: true,
      provider: manifest.provider,
      capability: capability.name,
      contextText,
      suggestedFollowUps: followUps,
    };
  }

  const startedAt = new Date();
  const res = await runRestCapability(manifest, capability.name, args, token);
  const durationMs = Date.now() - startedAt.getTime();
  const timestamp = startedAt.toISOString();

  const trace: GenericToolTrace = {
    id: crypto.randomUUID(),
    provider: manifest.provider,
    capability: capability.name,
    input: args,
    output: res.ok ? res.output : (res.error ?? "Erro desconhecido"),
    status: res.ok ? "ok" : "error",
    durationMs,
    timestamp,
  };

  if (opts.missionId) {
    try {
      const db = getDb();
      const rows = await db
        .select({ evidence: missions.evidence })
        .from(missions)
        .where(and(eq(missions.id, opts.missionId), eq(missions.userId, opts.userId)))
        .limit(1);

      if (rows[0]) {
        const prevEv = parseEvidence(rows[0].evidence);
        const evidenceItem: EvidenceItem = {
          id: trace.id,
          type: res.ok ? "tool_result" : "tool_error",
          content: `tool:${manifest.provider} capability:${capability.name} → ${trace.output}`,
          source: "tool_dispatcher",
          taskId: null,
          missionId: opts.missionId,
          createdAt: timestamp,
        };

        await db
          .update(missions)
          .set({ evidence: [...prevEv, evidenceItem], updatedAt: new Date() })
          .where(eq(missions.id, opts.missionId));
      }
    } catch {
      /* ignore evidence error */
    }
  }

  const contextText = res.ok
    ? `[EXECUÇÃO DE FERRAMENTA DO CONECTOR ${manifest.displayName.toUpperCase()}]
Capability executada: ${capability.name}
Status: Sucesso (${durationMs}ms)
Dados retornados:
${res.output}`
    : `[EXECUÇÃO DE FERRAMENTA DO CONECTOR ${manifest.displayName.toUpperCase()}]
Capability executada: ${capability.name}
Status: Erro (${durationMs}ms)
Mensagem de erro: ${res.error}`;

  return {
    executed: true,
    provider: manifest.provider,
    capability: capability.name,
    trace,
    contextText,
  };
}
