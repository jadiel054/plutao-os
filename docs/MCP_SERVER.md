# MCP Server do Plutão — OAuth 2.1 (produção)

Arquitetura alinhada a **GitHub / Vercel MCP** e à spec MCP Authorization:

| Papel | Componente |
|-------|------------|
| **Resource server** | `POST/GET /api/mcp` — tools; só `Authorization: Bearer` |
| **Authorization server** | `/api/oauth/authorize`, `/api/oauth/token`, consent UI |
| **Discovery** | `/.well-known/oauth-protected-resource` + `oauth-authorization-server` |

**Scopes:** `mcp:read` (obrigatório) e `mcp:write` (envio de mensagens). Tokens de GitHub/Vercel/Neon **nunca** saem nas respostas.

---

## Endpoints

| URL | Função |
|-----|--------|
| `https://<APP>/api/mcp` | MCP Streamable HTTP |
| `https://<APP>/.well-known/oauth-protected-resource` | RFC 9728 |
| `https://<APP>/.well-known/oauth-authorization-server` | RFC 8414 |
| `https://<APP>/api/oauth/authorize` | Login + redirect consent |
| `https://<APP>/api/oauth/register` | Registra cliente OAuth público e emite `client_id` automaticamente (RFC 7591) |
| `https://<APP>/oauth/consent` | UI de permissão (lista scopes) |
| `https://<APP>/api/oauth/token` | code → access_token + refresh (PKCE) |
| `https://<APP>/api/oauth/revoke` | revoga grant (token ou grant_id autenticado) |
| `https://<APP>/api/oauth/grants` | lista grants do usuário (sessão) |

---

## Variáveis de ambiente (Vercel)

```bash
APP_URL=https://plutao-os.vercel.app

# Assinatura de auth codes e access tokens (≥16 chars)
MCP_TOKEN_SECRET=   # openssl rand -hex 32
# fallback: CONNECTOR_TOKEN_SECRET ou SESSION_SECRET

# Ops break-glass (opcional) — só header Bearer, nunca query
# Ops key recebe mcp:read + mcp:write para dogfooding
PLUTAO_MCP_API_KEY=
PLUTAO_MCP_USER_ID=

# Obrigatório para callbacks HTTPS próprios: URIs completas e exatas,
# incluindo query string, separadas por vírgula. Vazio recusa todo HTTPS.
#
# Clientes locais podem usar callback loopback HTTP em localhost ou
# 127.0.0.1. O servidor aceita qualquer porta, mas exige o caminho /callback
# e rejeita fragmentos. Use HTTPS apenas com URI completa cadastrada na
# allowlist; rotas de callback devem pertencer ao Plutão.
MCP_OAUTH_REDIRECT_ALLOWLIST=https://cliente.example/oauth/callback?client=plutao
```

Redeploy após salvar. **Não** use token na query string.

---

## Fluxo de cliente MCP com OAuth

1. Cliente chama `/api/mcp` sem token → **401** +  
   `WWW-Authenticate: Bearer resource_metadata="https://…/.well-known/oauth-protected-resource"`
2. Cliente lê PRM → `authorization_servers: [APP_URL]`
3. Cliente lê AS metadata → authorize + token endpoints; `scopes_supported: mcp:read mcp:write`
4. Browser: `/api/oauth/authorize?…&scope=mcp:read%20mcp:write&code_challenge=…&code_challenge_method=S256`
5. Usuário loga no Plutão → **Autorizar** no consent (scopes listados)
6. Redirect com `?code=` → cliente troca em `/api/oauth/token` com `code_verifier`
7. Cliente usa `Authorization: Bearer <access_token>` nas tools

**PKCE S256 é obrigatório.** Access token: ~1h, `aud` = URL do MCP.

Clientes MCP compatíveis com registro dinâmico chamam `POST /api/oauth/register` com `redirect_uris`; não precisam de `client_id` pré-criado. O servidor devolve um `client_id` e restringe cada cliente às URIs registradas. Clientes legados configurados manualmente continuam aceitos pelo fluxo OAuth anterior **somente quando a URI também passa pela allowlist exata**; não existe fallback HTTPS aberto.

---

## Ops (curl / CI)

```bash
curl -sS -X POST "$APP_URL/api/mcp" \
  -H "Authorization: Bearer $PLUTAO_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## Segurança (checklist)

- [x] Sem secret em query string
- [x] Bearer only no resource server
- [x] PKCE S256
- [x] Consentimento explícito (conta, client_id, redirect_uri, scopes)
- [x] Redirect fail-closed: URI HTTPS completa (origin + caminho + query) exata; loopback HTTP restrito a `/callback`
- [x] Token curto + audience fixa no MCP
- [x] Sem tokens de conectores nas respostas
- [x] 401 com `resource_metadata` (RFC 9728)
- [x] Auth codes single-use (DB)
- [x] Refresh token + rotação
- [x] Registro dinâmico OAuth de clientes MCP (RFC 7591); quota 10 registros/hora por IP (hash chaveado)
- [x] Revogação de grants (API + UI Privacidade)
- [x] Write tools (`mcp:write`) com gate no call time
- [x] Rate limit por grant: 30 calls/min **em todas as tools** (guard `withMcpGuards`)
- [x] Auditoria de todo call (audit_events `mcp.tool_call`)
- [x] `system_status.model` mascarado (`plutao-primary`)
- [x] Evidence de missão (`model_step.source`) mascarado (`model:plutao-primary`) — não grava identificadores externos de provedor/modelo

---

## Tools

| Tool | Scope | Descrição |
|------|-------|-----------|
| `plutao_system_status` | read | Modelo mascarado, fase, resumo conectores |
| `plutao_list_connectors` | read | Status/capabilities sem secrets |
| `plutao_list_conversations` | read | Conversas do chat (tabela `conversations`) |
| `plutao_get_mission` | read | Detalhe da missão do `sub` do token |
| `plutao_send_message` | **write** | Envia mensagem; cria conversa se omitir id; ownership check |

### `plutao_send_message`

- Input: `{ content: string (1–4000), conversationId?: uuid }`
- Sem `conversationId`: cria conversa; mensagens com `metadata.source = "mcp"`
- Com id: anexa **somente** se `conversation.userId === token.sub` (senão forbidden)
- Sem `mcp:write`: erro claro com hint de re-consent
- Resposta: `conversationId`, ids das mensagens, texto do agente

### Auditoria

Todo call (read e write) grava em `audit_events`:

- `userId`, `client_id`, `grant_id`, `tool`, `params_sha256`, `latency_ms`, `status`, timestamp
- Nunca grava Bearer nem tokens de conector

### Rate limit

30 calls / 60s por grant, com bucket persistido e incremento atômico no Neon (`rate_limit_buckets`). Acima: `rate_limited` + `retryAfterSec`, inclusive entre instâncias Vercel.

O endpoint de registro OAuth é limitado a 10 cadastros por hora por IP (janela UTC, hash HMAC armazenado no Neon). Para revisar e limpar manualmente clientes dinâmicos sem grants com mais de 30 dias, use `docs/sql/cleanup_mcp_oauth_clients.sql`.

---

## Arquivos

- `apps/web/src/lib/mcp/tokens.ts` — codes + access tokens HMAC; `MCP_SCOPES`
- `apps/web/src/lib/mcp/auth.ts` — Bearer verify + ALS + `hasMcpScope`
- `apps/web/src/lib/mcp/tools.ts` — tools + send_message
- `apps/web/src/lib/mcp/audit.ts` — audit (erros passam pelo sanitizador central) + rate limit
- `apps/web/src/lib/mcp/tools.ts#withMcpGuards` — rate limit + auditoria para todas as tools
- `apps/web/src/lib/mcp/grants.ts` — grants DB
- `apps/web/src/app/api/mcp/route.ts`
- `apps/web/src/app/api/oauth/*`
- `apps/web/src/app/oauth/consent/page.tsx`
- `apps/web/src/app/.well-known/*`
