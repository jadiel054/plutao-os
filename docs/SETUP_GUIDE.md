# Setup Guide — plutao-os

Guia de configuração do ambiente de desenvolvimento.

## Pré-requisitos

- Node.js 20+
- npm 10+
- Conta Neon (Postgres serverless)
- (Opcional) Stripe CLI para testar billing local

## Passo a passo

```bash
# 1. Clone
git clone https://github.com/jadiel054/plutao-os.git
cd plutao-os

# 2. Dependências
npm install

# 3. Variáveis de ambiente
cp .env.example .env
# Preencha DATABASE_URL (Neon), SESSION_SECRET, etc.

# 4. Banco: aplique as migrações
npm run db:migrate

# 5. Rode a aplicação
npm run dev
```

## Fluxo de contribuição (PR via branch — sem push direto)

**Nunca faça commit direto na `main`.** Todo trabalho entra por Pull Request:

```bash
# 1. Crie uma branch a partir da main atualizada
git checkout main
git pull origin main
git checkout -b feat/minha-feature   # ou fix/, chore/, docs/

# 2. Trabalhe e faça commits locais
git add <arquivos>
git commit -m "feat: descreva a mudança"

# 3. Publique a branch e abra o PR no GitHub
git push -u origin feat/minha-feature
# Abra o PR em https://github.com/jadiel054/plutao-os/compare
```

Regras do PR:

- Título com prefixo convencional (`feat:`, `fix:`, `chore:`, `docs:`).
- Descrição com o quê/porquê e como testar.
- CI verde (lint + testes) é obrigatório antes do merge.
- Pelo menos uma revisão/aprovação antes do merge (squash-merge).

## Banco de dados (Neon)

- `DATABASE_URL` vem do console Neon: copie em https://console.neon.tech.
- Em produção, segredos ficam nos GitHub Secrets / no painel de deploy — nunca no repo.
- Consultas ad-hoc de manutenção usam os scripts em `scripts/` (ex.: `cleanup_temp_accounts.sql`), preferencialmente com `dry_run` primeiro.

## Secrets exigidos pelo workflow `cleanup_temp_accounts`

O workflow `.github/workflows/cleanup_temp_accounts.yml` precisa destes secrets
(Settings → Secrets and variables → Actions → New repository secret):

| Secret | Obrigatório | Descrição / como obter |
|---|---|---|
| `NEON_DB_HOST` | Sim | Host do endpoint Neon (ex.: `ep-xxx-xxx.aws-region.neon.tech`) — console Neon → seu projeto → Connection Details → host |
| `NEON_DB_NAME` | Sim | Nome do banco (ex.: `neondb`) — console Neon → Branches → databases |
| `NEON_DB_USER` | Sim | Role com permissão de DELETE nas tabelas `public` — console Neon → Roles; use uma role dedicada (ex.: `cleanup_role`), não o superusuário |
| `NEON_DB_PASSWORD` | Sim | Senha da role acima — console Neon → Roles → reset password; cole o valor no secret |
| `SLACK_WEBHOOK_URL` | Não (opcional) | Incoming Webhook do Slack (api.slack.com/messaging/webhooks) para notificação de resultado; se ausente, o step falha silenciosamente (`continue-on-error`) |

Como criar cada um:

1. **`NEON_DB_HOST` / `NEON_DB_NAME`**: no [console Neon](https://console.neon.tech), abra o projeto → Connection Details; copie `host` e `database` (sem `sslmode` ou outros parâmetros).
2. **`NEON_DB_USER` / `NEON_DB_PASSWORD`**: em Neon → Roles, crie uma role dedicada com `GRANT DELETE, SELECT ON ALL TABLES IN SCHEMA public` (e `GRANT USAGE ON SCHEMA public`), gere a senha e registre nos secrets.
3. **`SLACK_WEBHOOK_URL`** (opcional): em api.slack.com/messaging/webhooks, crie o webhook do canal de alertas e cole a URL completa (`https://hooks.slack.com/services/...`).

Recomendação: o primeiro agendamento deve ser precedido de uma execução manual
com `dry_run=true` e revisão do relatório (artifact `cleanup-temp-accounts-report`).

## Verificação

```bash
npm run lint
npm run test
npm run dev   # http://localhost:3000
```
