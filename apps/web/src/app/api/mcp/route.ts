/**
 * Plutão MCP Resource Server.
 * URL: https://<APP_URL>/api/mcp
 * Auth: Authorization: Bearer <OAuth access token | read-only ops key>
 * Discovery: /.well-known/oauth-protected-resource
 * Read tools require mcp:read; mission/chat writes require explicit OAuth mcp:write consent.
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
  toolCreateMission,
  toolListConnectors,
  toolListConversations,
  toolSendMessage,
  toolSystemStatus,
  withMcpGuards,
} from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const mcpHandler = createMcpHandler((server) => {
  server.registerTool(
    "plutao_system_status",
    {
      title: "Status do sistema Plutão",
      description: "Status read-only: modelo mascarado, conectores do usuário autenticado e fase MCP.",
      inputSchema: z.object({}),
    },
    async () =>
      withMcpGuards("plutao_system_status", {}, async () => {
        const { userId, method } = getMcpAuth();
        return toolSystemStatus(userId, method);
      }),
  );

  server.registerTool(
    "plutao_list_connectors",
    {
      title: "Listar conectores",
      description: "Status e capabilities dos conectores da conta; nunca inclui access tokens.",
      inputSchema: z.object({}),
    },
    async () =>
      withMcpGuards("plutao_list_connectors", {}, async () => {
        const { userId } = getMcpAuth();
        return toolListConnectors(userId);
      }),
  );

  server.registerTool(
    "plutao_list_conversations",
    {
      title: "Listar conversas",
      description: "Conversas recentes do chat do usuário (id, título e pin).",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional().describe("Máximo (default 20)"),
      }),
    },
    async ({ limit }) =>
      withMcpGuards("plutao_list_conversations", { limit }, async () => {
        const { userId } = getMcpAuth();
        return toolListConversations(userId, limit ?? 20);
      }),
  );

  server.registerTool(
    "plutao_get_mission",
    {
      title: "Detalhe de missão",
      description: "Plano, passos, evidências e erros, somente para missões do usuário autenticado.",
      inputSchema: z.object({ missionId: z.string().min(1).describe("UUID da missão") }),
    },
    async ({ missionId }) =>
      withMcpGuards("plutao_get_mission", { missionId }, async () => {
        const { userId } = getMcpAuth();
        return toolGetMission(userId, missionId);
      }),
  );

  server.registerTool(
    "plutao_create_mission",
    {
      title: "Criar missão",
      description: "Cria missão pertencente ao usuário e deixa em CREATED. Não inicia execução; exige consentimento OAuth mcp:write. Reuse idempotencyKey em tentativas repetidas.",
      inputSchema: z.object({
        objective: z.string().min(3).max(1000).describe("Objetivo da missão (até 1000 caracteres)"),
        context: z.string().max(4000).optional(),
        constraints: z.string().max(4000).optional(),
        definitionOfDone: z.string().max(4000).optional(),
        conversationId: z.string().uuid().optional(),
        idempotencyKey: z.string().uuid().describe("UUID estável para esta intenção; reuse em retries"),
      }),
    },
    async (input) =>
      withMcpGuards("plutao_create_mission", input, async () => {
        const { userId } = getMcpAuth();
        return toolCreateMission(userId, input);
      }, { requiredScope: "mcp:write" }),
  );

  server.registerTool(
    "plutao_send_message",
    {
      title: "Enviar mensagem ao Plutão",
      description: "Envia uma mensagem textual ao modelo configurado e persiste a conversa do usuário. Não executa ferramentas de conectores; exige consentimento OAuth mcp:write.",
      inputSchema: z.object({
        content: z.string().min(1).max(4000).describe("Mensagem (até 4000 caracteres)"),
        conversationId: z.string().uuid().optional().describe("Conversa própria existente; omita para criar uma nova"),
      }),
    },
    async (input) =>
      withMcpGuards("plutao_send_message", input, async () => {
        const { userId } = getMcpAuth();
        return toolSendMessage(userId, input);
      }, { requiredScope: "mcp:write" }),
  );
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Authorization, Content-Type, Last-Event-ID, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id, WWW-Authenticate",
};

function withMcpCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function handle(req: Request): Promise<Response> {
  const auth = await authenticateMcpRequest(req);
  if (!auth.ok) return withMcpCors(mcpUnauthorizedResponse(auth));

  const response = await mcpAuthStore.run(
    {
      userId: auth.userId,
      scopes: auth.scopes,
      clientId: auth.clientId,
      grantId: auth.grantId,
      method: auth.method,
    },
    () => mcpHandler(req),
  );
  return withMcpCors(response);
}

export { handle as GET, handle as POST, handle as DELETE };
