# Testing Guidelines — plutao-os

> Versão aprovada em 2026-10-03. Alterações neste arquivo exigem revisão em PR.

## Política de contas de teste

### Taxonomia

| Domínio | Tipo | Ciclo de vida | Uso |
|---|---|---|---|
| `@test.plutao.app` | **Permanente** | Nunca expira; não é removida pelo cleanup | Contas de teste estáveis: regressão, smoke, demos |
| `@temp.plutao.app` | **Descartável** | Removida automaticamente após 7 dias (ver `scripts/cleanup_temp_accounts.sql`) | Dados efêmeros: cargas, testes de estresse, cenários descartáveis |
| `is_guest = true` | **Guest** | Removida pelo cleanup se expirada e não convertida | Fluxo de guest mode do produto |

### Convenções de nomeação

- E-mail no formato `recurso@test.plutao.app` ou `recurso@temp.plutao.app`, onde `recurso` descreve o cenário: `checkout@`, `billing-cancel@`, `mission-timeout@`, `connector-oauth@` etc.
- Sufixo numérico para variações do mesmo cenário: `checkout-2@temp.plutao.app`.
- `name` do usuário: `[TEST] <cenário>` — ex.: `[TEST] Checkout`.
- Nunca reutilizar e-mail `@temp.plutao.app` entre suites: cada suite gera o seu (`<suite>-<timestamp>@temp.plutao.app`).

### Instruções por agente

- **Agentes/CI:** criam exclusivamente contas `@temp.plutao.app` (ou `is_guest`), nunca `@test.plutao.app`.
- **Testes de regressão/smoke:** usam as contas `@test.plutao.app` fixas registradas no cofre do CI; não criam contas novas.
- **Cleanup:** a rotina `cleanup_temp_accounts` remove contas `@temp.plutao.app` com mais de 7 dias **e** guests expirados não convertidos. Contas `@test.plutao.app` nunca são removidas automaticamente.
- **Remoção manual de uma conta `@test.plutao.app`** exige PR de aprovação e execução manual com `dry_run` revisado.

## Princípios gerais

1. **Todo bugfix ou feature chega acompanhado de teste.** Sem teste, o PR não é mergeado.
2. **Testes devem ser determinísticos.** Nada de depender de clock, rede, ordenação implícita ou dados de produção.
3. **Isolamento:** cada teste monta o próprio estado e limpa depois de si (`beforeEach`/`afterEach`).

## Stack

| Camada | Ferramenta | Onde |
|---|---|---|
| Unitário / integração | Vitest | `vitest.config.ts` (raiz) |
| Componentes web | Vitest + Testing Library | `apps/web` |
| Banco (unitário de schema) | Drizzle + banco efêmero (Neon branch ou PG local) | `packages/db` |

## Comandos

```bash
npm run test          # tudo
npm run test:unit     # unitários
npm run test:web      # apps/web
```

## O que testar (checklist de PR)

- [ ] Caminho feliz do caso de uso alterado.
- [ ] Caminhos de erro (entrada inválida, upstream falhando, timeout).
- [ ] Limites (array vazio, valor máximo, unicode).
- [ ] Regressão: o bug que motivou o PR tem teste que falha sem o fix.

## Convenções

- Arquivos de teste ao lado do código: `foo.test.ts` / `foo.spec.ts`.
- Use factories/seeders, não literalmente objetos duplicados em cada teste.
- Mocke fronteiras (HTTP, DB, SDKs), nunca o código sob teste.
- Flaky test = bug: desabilitar teste exige issue e prazo de correção.

## Evidências de testes manuais

Testes manuais exploratórios são documentados em `docs/testes/YYYY-MM-DD-<slug>/`
com passos, resultado esperado/obtido e screenshots quando aplicável.

## DB em testes

- Nunca aponte testes para a branch `main` do Neon.
- Use uma branch efêmera por suite (`neon branches create`) e destrua no `afterAll`.
- Migrações Drizzle rodam antes da suite (`drizzle-kit migrate`).
