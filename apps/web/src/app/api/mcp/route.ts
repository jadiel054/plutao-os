/**
 * Plutão MCP Server — Fase 1
 *
 * Endpoint remoto para agentes externos (Claude, Cursor, etc.) auditarem
 * o Plutão com tools read-only.
 *
 * URL: https://<APP_URL>/api/mcp
 * Auth: Authorization: Bearer <PLUTAO_MCP_API_KEY>
 *
 * Transporte: Streamable HTTP via mcp-handler (spec 2026 + fallback 2025).
 */

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  authenticateMcpRequest,
  mcpUnauthorizedResponse,
} from "@/lib/mcp/auth";
import {
  toolGetMission,
  toolListConnectors,
  toolListConversations,
  toolSystemStatus,
} from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

/** userId da request autenticada (AsyncLocal-style por request via closure). */
let activeUserId: string | null = null;

const mcpHandler = createMcpHandler((server) => {
  server.registerTool(
    "plutao_system_status",
    {
      title: "Status do sistema Plutão",
      description:
        "Retorna status de auditoria: modelo configurado (sem secrets), conectores do usuário e fase do MCP.",
      inputSchema: z.object({}),
    },
    async () => {
      const userId = requireUser();
      return toolSystemStatus(userId);
    }
  );

  server.registerTool(
    "plutao_list_connectors",
    {
      title: "Listar conectores",
      description:
        "Lista conectores do usuário (GitHub, Vercel, …) com status, account e capabilities — sem tokens.",
      inputSchema: z.object({}),
    },
    async () => {
      const userId = requireUser();
      return toolListConnectors(userId);
    }
  );

  server.registerTool(
    "plutao_list_conversations",
    {
      title: "Listar conversas / missões",
      description: "Lista missões/conversas recentes do usuário (id, objective, status, pin).",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional().describe("Máximo de itens (default 20)"),
      }),
    },
    async ({ limit }) => {
      const userId = requireUser();
      return toolListConversations(userId, limit ?? 20);
    }
  );

  server.registerTool(
    "plutao_get_mission",
    {
      title: "Detalhe de missão",
      description:
        "Retorna plano, passos, evidências e erros de uma missão pelo id (somente do usuário autenticado).",
      inputSchema: z.object({
        missionId: z.string().min(1).describe("UUID da missão"),
      }),
    },
    async ({ missionId }) => {
      const userId = requireUser();
      return toolGetMission(userId, missionId);
    }
  );
});

function requireUser(): string {
  if (!activeUserId) {
    throw new Error("MCP auth context missing");
  }
  return activeUserId;
}

async function handle(req: Request): Promise<Response> {
  const auth = authenticateMcpRequest(req);
  if (!auth.ok) {
    return mcpUnauthorizedResponse(auth);
  }

  activeUserId = auth.userId;
  try {
    return await mcpHandler(req);
  } finally {
    activeUserId = null;
  }
}

export {
  handle as GET,
  handle as POST,
  handle as DELETE,
};
