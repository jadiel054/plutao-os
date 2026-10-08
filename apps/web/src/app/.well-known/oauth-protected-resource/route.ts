import { getMcpIssuer, getMcpResourceUrl } from "@/lib/mcp/tokens";

export const runtime = "nodejs";

/** RFC 9728 — discovery do authorization server para clientes MCP. */
export async function GET() {
  const issuer = getMcpIssuer();
  const resource = getMcpResourceUrl();

  const body = {
    resource,
    authorization_servers: [issuer],
    scopes_supported: ["mcp:read"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${issuer}/ajuda`,
    logo_uri: `${issuer}/icon.png`,
  };

  return Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
