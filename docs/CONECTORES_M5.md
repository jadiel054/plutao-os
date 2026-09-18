# Conectores — checklist M5 (GitHub OAuth real)

Objetivo: o operador consegue **conectar GitHub**, ver estados e capacidades na UI, e o Executor usa a tool `github` com evidência na trilha.

Código já está no `main`. Falta só ambiente + migration + um teste humano.

---

## 1. OAuth App no GitHub

1. GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**.
2. Preencha:
   - **Application name:** `Plutão` (ou o domínio que for usar)
   - **Homepage URL:** `https://SEU_DOMINIO` (produção) ou `http://localhost:3000` (local)
   - **Authorization callback URL:**  
     `https://SEU_DOMINIO/api/connectors/github/callback`  
     (local: `http://localhost:3000/api/connectors/github/callback`)
3. Crie e copie **Client ID** e **Client Secret**.

Escopos que o Plutão pede (fixados no catálogo de domínio): `repo`, `read:user`, `workflow`.

---

## 2. Variáveis no ambiente (Vercel / `.env.local`)

```
APP_URL=https://SEU_DOMINIO
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
CONNECTOR_TOKEN_SECRET=   # openssl rand -base64 32  (ou SESSION_SECRET ≥16 chars)
```

Reinicie o deploy depois de gravar.

---

## 3. Migration 0004 no Neon

Usar **URL direta** (sem `-pooler`):

```bash
export DATABASE_URL_UNPOOLED="postgresql://...@....neon.tech/plutao?sslmode=require"
npm run migrate -w @plutao/db
```

SQL: `packages/db/drizzle/0004_connectors.sql`  
Cria tabela `connectors` + índices. Idempotente (`IF NOT EXISTS`).

Se a tabela ainda não existir, a API responde 503 com mensagem clara: *"Tabela de conectores ainda não aplicada"*.

---

## 4. Fluxo de estados (produto)

```
disconnected → authorizing → connected
connected    → reconnecting → connected | error
*            → error → authorizing | disconnected
```

Onde aparece:

| Lugar | O que faz |
|-------|-----------|
| **Chat** → card *Ação sugerida* | Detecta pedido de GitHub sem conector; **Conectar** / **Pular** |
| **Sheet** (acesso rápido no chat) | Toggle + link para gerenciar |
| **Configurações → Conectores** | Lista, capacidades, reconectar, desconectar, erros OAuth |

Nada conecta sem clique do usuário.

---

## 5. Smoke M5 (ordem sugerida)

1. Login no Plutão.
2. **Configurações → Conectores** — deve listar GitHub como *Desconectado* (sem banner de env faltando).
3. **Conectar** → redireciona ao GitHub → autorizar → volta com `connector_ok=github`.
4. Status **Conectado**, `@login` visível, capacidades listadas (`repos_list`, `issues_list`, …).
5. No **Chat**, peça: *"lista meus repositórios no GitHub"* — card **não** deve aparecer (já conectado); se a missão/tool rodar, evidência na trilha.
6. **Desconectar** → status *Desconectado*; tool `github` deve falhar com mensagem de não conectado.
7. No chat com desconectado, peça de novo algo de repo → card **Conectar/Pular** deve aparecer.

---

## 6. Falhas esperadas (não são bug de produto)

| Sintoma | Causa provável |
|---------|----------------|
| Banner âmbar em Conectores | `GITHUB_CLIENT_*` ou secret de cifra ausente |
| 503 na API de listagem | Migration 0004 não aplicada |
| `state inválido ou expirado` | OAuth interrompido / state antigo |
| Tool: *GitHub não conectado* | Status ≠ `connected` ou token ilegível |

---

## Fora deste checklist

- Outros providers (Vercel, Stripe, Supabase…): entram **depois**, um a um, com o mesmo padrão de estados e OAuth — sem genérico.
- MCP server remoto “link explícito” além do mapeamento REST atual: evolução pós-M5.
