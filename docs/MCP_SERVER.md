# MCP Server do Plutão — Fase 1

O Plutão expõe um **servidor MCP remoto** para que agentes externos (Claude, Cursor, ChatGPT custom connector, etc.) auditem o sistema com tools **read-only**.

**Endpoint:** `https://<APP_URL>/api/mcp`  
**Transporte:** Streamable HTTP (`mcp-handler` + spec 2026-07-28, fallback 2025)  
**Auth:** `Authorization: Bearer <PLUTAO_MCP_API_KEY>`

---

## 1. Variáveis no Vercel

```bash
# Segredo longo — não reutilizar SESSION_SECRET
PLUTAO_MCP_API_KEY="$(openssl rand -hex 32)"

# UUID do seu usuário na tabela users (Neon → users → id)
PLUTAO_MCP_USER_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Target: **Production** (e Preview se for testar em branch).

Redeploy após salvar.

### Como achar o USER_ID

No Neon SQL:

```sql
SELECT id, email FROM users ORDER BY created_at LIMIT 10;
```

Use o `id` da conta que você usa no Plutão (missões e conectores dessa conta).

---

## 2. Tools disponíveis (Fase 1)

| Tool | Descrição |
|------|-----------|
| `plutao_system_status` | Modelo (sem secret), fase MCP, resumo de conectores |
| `plutao_list_connectors` | Status, account, scopes, capabilities (sem tokens) |
| `plutao_list_conversations` | Missões recentes (limit opcional) |
| `plutao_get_mission` | Detalhe: plan, steps, evidence, errors |

**Não incluído na Fase 1:** `send_message`, `run_test` (writes) — entram com gate de confirmação na Fase 1.5/2.

---

## 3. Conectar um cliente

### Claude (Custom connector)

1. Settings → Connectors → Add custom connector  
2. URL: `https://plutao-os.vercel.app/api/mcp` (ou seu domínio)  
3. Auth: Bearer / API key → cole o valor de `PLUTAO_MCP_API_KEY`

### Cursor / configs JSON (Streamable HTTP)

```json
{
  "mcpServers": {
    "plutao": {
      "url": "https://plutao-os.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer SEU_PLUTAO_MCP_API_KEY"
      }
    }
  }
}
```

### Teste rápido (curl)

```bash
curl -sS -X POST "https://plutao-os.vercel.app/api/mcp" \
  -H "Authorization: Bearer $PLUTAO_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Sem Bearer → **401**. Sem env configurado → **503**.

---

## 4. Segurança

- A key dá acesso de **leitura** às missões e conectores do `PLUTAO_MCP_USER_ID` apenas.
- Tokens OAuth de GitHub/Vercel **nunca** saem nas tools.
- Não commitar a key; só Vercel env.
- Fase 2: OAuth 2.1 + PKCE; API key fica só para ops/break-glass.

---

## 5. Roadmap

| Fase | Escopo |
|------|--------|
| **1** (agora) | `/api/mcp` + Bearer + 4 tools read-only |
| **1.5** | `send_message` / `run_test` com `test_session` + confirmação |
| **2** | OAuth 2.1, múltiplas keys por usuário na UI Configurações |

---

## 6. Arquivos

- `apps/web/src/app/api/mcp/route.ts` — handler HTTP
- `apps/web/src/lib/mcp/auth.ts` — Bearer
- `apps/web/src/lib/mcp/tools.ts` — implementação das tools
