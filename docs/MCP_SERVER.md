# MCP Server do Plutão — OAuth 2.1 (produção)

Arquitetura alinhada a **GitHub / Vercel MCP** e à spec MCP Authorization:

| Papel | Componente |
|-------|------------|
| **Resource server** | `POST/GET /api/mcp` — tools; só `Authorization: Bearer` |
| **Authorization server** | `/api/oauth/authorize`, `/api/oauth/token`, consent UI |
| **Discovery** | `/.well-known/oauth-protected-resource` + `oauth-authorization-server` |

**Tools:** somente leitura (`mcp:read`). Tokens de GitHub/Vercel/Neon **nunca** saem nas respostas.

---

## Endpoints

| URL | Função |
|-----|--------|
| `https://<APP>/api/mcp` | MCP Streamable HTTP |
| `https://<APP>/.well-known/oauth-protected-resource` | RFC 9728 |
| `https://<APP>/.well-known/oauth-authorization-server` | RFC 8414 |
| `https://<APP>/api/oauth/authorize` | Login + redirect consent |
| `https://<APP>/oauth/consent` | UI de permissão |
| `https://<APP>/api/oauth/token` | code → access_token (PKCE) |

---

## Variáveis de ambiente (Vercel)

```bash
APP_URL=https://plutao-os.vercel.app

# Assinatura de auth codes e access tokens (≥16 chars)
MCP_TOKEN_SECRET=   # openssl rand -hex 32
# fallback: CONNECTOR_TOKEN_SECRET ou SESSION_SECRET

# Ops break-glass (opcional) — só header Bearer, nunca query
PLUTAO_MCP_API_KEY=
PLUTAO_MCP_USER_ID=

# Opcional: restringir redirect_uri (prefixos separados por vírgula)
# Se vazio: https://* + localhost/127.0.0.1 (usuário vê URI no consent)
MCP_OAUTH_REDIRECT_ALLOWLIST=
```

Redeploy após salvar. **Não** use token na query string.

---

## Fluxo (cliente Claude / Cursor / Grok com OAuth)

1. Cliente chama `/api/mcp` sem token → **401** +  
   `WWW-Authenticate: Bearer resource_metadata="https://…/.well-known/oauth-protected-resource"`
2. Cliente lê PRM → `authorization_servers: [APP_URL]`
3. Cliente lê AS metadata → authorize + token endpoints
4. Browser: `/api/oauth/authorize?…&code_challenge=…&code_challenge_method=S256`
5. Usuário loga no Plutão (se preciso) → **Autorizar** no consent
6. Redirect com `?code=` → cliente troca em `/api/oauth/token` com `code_verifier`
7. Cliente usa `Authorization: Bearer <access_token>` nas tools

**PKCE S256 é obrigatório.** Access token: ~1h, `aud` = URL do MCP, scope `mcp:read`.

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
- [x] Token curto + audience fixa no MCP
- [x] Tools read-only; sem tokens de conectores
- [x] 401 com `resource_metadata` (RFC 9728)
- [ ] Write tools (`mcp:write`) — futuro, com scope + gate
- [ ] Revogação de grants na UI — próximo polish

---

## Tools

| Tool | Descrição |
|------|-----------|
| `plutao_system_status` | Modelo (sem key), fase, resumo conectores |
| `plutao_list_connectors` | Status/capabilities sem secrets |
| `plutao_list_conversations` | Missões recentes |
| `plutao_get_mission` | Detalhe da missão do `sub` do token |

---

## Arquivos

- `apps/web/src/lib/mcp/tokens.ts` — codes + access tokens HMAC
- `apps/web/src/lib/mcp/auth.ts` — Bearer verify + ALS
- `apps/web/src/lib/mcp/tools.ts` — tools
- `apps/web/src/app/api/mcp/route.ts`
- `apps/web/src/app/api/oauth/*`
- `apps/web/src/app/oauth/consent/page.tsx`
- `apps/web/src/app/.well-known/*`
