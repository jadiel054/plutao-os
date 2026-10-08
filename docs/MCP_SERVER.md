# Plutão MCP Server — OAuth 2.1 / Streamable HTTP

O Plutão oferece um servidor MCP HTTP protegido. O resource server publica **somente leitura**: quatro tools com escopo `mcp:read`. A antiga tool `plutao_send_message` foi removida porque não havia gate explícito de confirmação antes de gravar/acionar o agente. Nenhum token de GitHub, Vercel, Neon ou outro conector é retornado.

| Papel | URL |
|---|---|
| Resource server | `https://plutao-os.vercel.app/api/mcp` |
| Protected Resource Metadata (RFC 9728) | `/.well-known/oauth-protected-resource` |
| Authorization Server Metadata (RFC 8414) | `/.well-known/oauth-authorization-server` |
| Authorization / consent | `/api/oauth/authorize` → `/oauth/consent` |
| Token / revoke | `/api/oauth/token` · `/api/oauth/revoke` |
| Dynamic Client Registration (compatibilidade) | `/api/oauth/register` |

## Compatibilidade e descoberta

- O AS anuncia suporte a **Client ID Metadata Documents (CIMD)**. Clientes modernos devem preferir CIMD; o Plutão recupera o documento por HTTPS sem seguir redirects, com timeout e limite de tamanho.
- A resolução CIMD bloqueia host local/privado, valida DNS e fixa um endereço público para a conexão HTTPS; aceita apenas documento JSON público, `client_id` correspondente exatamente, cliente público (`token_endpoint_auth_method=none`) e `response_types=[code]`.
- Callback HTTPS CIMD deve ser da **mesma origin** do documento client_id, ou estar na allowlist exata do servidor. O authorize request precisa repetir exatamente um `redirect_uri` declarado no documento.
- DCR (RFC 7591) continua disponível para clientes que não suportem CIMD. HTTPS em DCR e clientes legados é fail-closed e requer allowlist global **exata**. Erros retornam `error=invalid_redirect_uri`, uma razão estável e `invalid_uri`; a URI é percent-encoded também em `error_description`. A resposta JSON faz o escape apropriado; o valor não é escrito em logs.
- Redirects HTTP são aceitos somente para `localhost`, `127.0.0.1` e `[::1]`, com porta variável conforme RFC 8252. Wildcards, HTTP remoto, fragmentos e userinfo são recusados. URIs repetidas idênticas no DCR são deduplicadas antes da validação.
- `resource` é o URI canônico do servidor MCP, informado em authorization e token requests e verificado antes de emitir/aceitar tokens. PKCE S256 é obrigatório. O callback inclui `iss` (RFC 9207).

## Vercel: configuração operacional

```bash
APP_URL=https://plutao-os.vercel.app

# HMAC de authorization codes/access tokens (>=16 caracteres)
MCP_TOKEN_SECRET=   # openssl rand -hex 32
# Fallback legado: CONNECTOR_TOKEN_SECRET ou SESSION_SECRET

# Opcional — break-glass, somente Bearer no header e escopo fixo mcp:read
PLUTAO_MCP_API_KEY=
PLUTAO_MCP_USER_ID=

# Opcional — callbacks HTTPS de DCR e clientes legados que não usem CIMD.
# Lista separada por vírgula de URIs COMPLETAS, exatamente como declaradas.
# Inclua path e query quando existirem. Nunca use curingas.
MCP_OAUTH_REDIRECT_ALLOWLIST=https://cliente.example/oauth/callback?client=plutao
```

Após alteração de env, faça redeploy. **Nunca** passe Bearer/access/refresh tokens em query string ou URL. Não há migration de banco para esta correção.

## Fluxo MCP OAuth

1. Cliente inicia `POST /api/mcp` sem token e recebe `401` com `WWW-Authenticate`, `resource_metadata` e `scope="mcp:read"`.
2. Cliente descobre PRM/AS metadata. O metadata AS informa CIMD, DCR compatível, `mcp:read` e suporte a `iss`.
3. Cliente registra/resolve identidade via CIMD ou usa DCR. Deve enviar `resource=https://plutao-os.vercel.app/api/mcp`, `response_type=code`, `code_challenge_method=S256`, challenge, client_id e redirect_uri exata.
4. Usuário faz login e vê o nome/identidade do cliente e o único escopo de leitura. Pode autorizar ou negar o consentimento.
5. O callback recebe `code`, `state` e `iss`. O cliente troca o código em `/api/oauth/token` com `client_id`, `redirect_uri`, `code_verifier` e `resource`.
6. Chamadas MCP usam `Authorization: Bearer <access_token>` no header. Token tem audiência fixa no endpoint MCP. Access token expira em ~1h; refresh token, quando elegível, é opaco e rotacionado.

## Erros DCR de callback

Exemplo ilustrativo:

```json
{
  "error": "invalid_redirect_uri",
  "error_description": "redirect_uri recusada (https_uri_not_allowlisted): https%3A%2F%2Fcliente.example%2Fcallback",
  "reason": "https_uri_not_allowlisted",
  "invalid_uri": "https://cliente.example/callback"
}
```

Use o valor `invalid_uri` exato na allowlist — ou configure o cliente para CIMD com callback same-origin. As razões incluem `malformed_uri`, `wildcard_not_allowed`, `userinfo_not_allowed`, `fragment_not_allowed`, `http_non_loopback`, `unsupported_scheme`, `https_uri_not_allowlisted` e `not_registered_for_client`.

## Operação e verificação

```bash
curl -sS -X POST "$APP_URL/api/mcp" \
  -H "Authorization: Bearer $PLUTAO_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

CORS permite origem cruzada sem cookies, incluindo `Authorization`, `MCP-Protocol-Version` e `Last-Event-ID`; `OPTIONS` responde ao preflight. Tokens são aceitos somente no header Bearer.

### Tools de leitura

| Tool | Conteúdo |
|---|---|
| `plutao_system_status` | Status resumido, modelo mascarado e capacidades read-only |
| `plutao_list_connectors` | Estado/capabilities, sem tokens |
| `plutao_list_conversations` | Conversas do usuário autenticado |
| `plutao_get_mission` | Detalhes de uma missão pertencente ao usuário autenticado |

Todas passam por rate limit de 30 chamadas/minuto por grant e trilha de auditoria. Não há `mcp:write` no metadata, na API key operacional, na tela de consentimento nem em `tools/list`.

## Arquivos principais

- `apps/web/src/lib/mcp/tokens.ts` — tokens/códigos, scope e validação de callback
- `apps/web/src/lib/mcp/clientRegistration.ts` — DCR e allowlist de grant
- `apps/web/src/lib/mcp/clientMetadata.ts` — CIMD, validação SSRF e callbacks
- `apps/web/src/lib/mcp/auth.ts` — autenticação Bearer, ALS e `mcp:read`
- `apps/web/src/lib/mcp/tools.ts` — tools read-only, rate limit e auditoria
- `apps/web/src/lib/mcp/grants.ts` — grants e códigos single-use no banco
- `apps/web/src/app/api/mcp/route.ts` — MCP Streamable HTTP + CORS
- `apps/web/src/app/api/oauth/*` — registro, autorização, token e revogação
- `apps/web/src/app/oauth/consent/page.tsx` — consentimento explícito
