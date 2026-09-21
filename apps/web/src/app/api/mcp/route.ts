/**
 * Plutão MCP Resource Server
 *
 * URL: https://<APP_URL>/api/mcp
 * Auth: Authorization: Bearer <access_token OAuth | ops API key>
 * Discovery: /.well-known/oauth-protected-resource
 *
 * Tools: somente leitura (mcp:read). Tokens de conectores nunca são expostos.
 */

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  authenticateMcpRequest,
  getMcpAuth,
  mcpAuthStore,
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

const mcpHandler = createMcpHandler((server) => {
  server.registerTool(
    "plutao_system_status",
    {
      title: "Status do sistema Plutão",
      description:
        "Auditoria: modelo (sem secrets), conectores do usuário autenticado e fase MCP.",
      inputSchema: z.object({}),
    },
    async () => {
      const { userId, method } = getMcpAuth();
      return toolSystemStatus(userId, method);
    }
  );

  server.registerTool(
    "plutao_list_connectors",
    {
      title: "Listar conectores",
      description:
        "Status, account e capabilities dos conectores — nunca inclui access tokens.",
      inputSchema: z.object({}),
    },
    async () => {
      const { userId } = getMcpAuth();
      return toolListConnectors(userId);
    }
  );

  server.registerTool(
    "plutao_list_conversations",
    {
      title: "Listar conversas / missões",
      description: "Missões recentes do usuário (id, objective, status, pin).",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional().describe("Máximo (default 20)"),
      }),
    },
    async ({ limit }) => {
      const { userId } = getMcpAuth();
      return toolListConversations(userId, limit ?? 20);
    }
  );

  server.registerTool(
    "plutao_get_mission",
    {
      title: "Detalhe de missão",
      description: "Plano, passos, evidências e erros — somente missões do usuário do token.",
      inputSchema: z.object({
        missionId: z.string().min(1).describe("UUID da missão"),
      }),
    },
    async ({ missionId }) => {
      const { userId } = getMcpAuth();
      return toolGetMission(userId, missionId);
    }
  );
});

async function handle(req: Request): Promise<Response> {
  const auth = await authenticateMcpRequest(req);
  if (!auth.ok) {
    return mcpUnauthorizedResponse(auth);
  }

  return mcpAuthStore.run(
    {
      userId: auth.userId,
      scopes: auth.scopes,
      clientId: auth.clientId,
      grantId: auth.grantId,
      method: auth.method,
    },
    () => mcpHandler(req)
  );
}

export { handle as GET, handle as POST, handle as DELETE };
