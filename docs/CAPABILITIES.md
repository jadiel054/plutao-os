# Registro de capacidades — Plutão OS

> **Arquivo gerado.** Fonte de verdade: `apps/web/src/lib/capabilities/registry.ts`.
> Não edite este documento à mão — rode `npm run docs:capabilities` e commite o resultado.

O registro responde três perguntas antes de qualquer execução: **esta capacidade existe?**,
**ela está habilitada?** e **os controles de segurança que ela exige estão implementados?**
Qualquer resposta negativa faz o executor **recusar** a chamada (fail-closed).

## Controles

| Controle | Implementado | Descrição |
| --- | --- | --- |
| `capability_allowlist` | sim | A capacidade precisa existir no registro e estar habilitada; ausência de manifesto/allowlist é recusa. |
| `input_sanitization` | sim | Entrada do usuário/modelo é validada e sanitizada antes de virar parâmetro de execução. |
| `output_sanitization` | sim | Saída e mensagens de erro passam pelo sanitizador central (`lib/security/sanitize.ts`). |
| `write_gate` | sim | Efeito colateral real exige write_gate aprovado por humano (Princípio 1). |
| `gate_server_validation` | sim | O gate é validado no servidor: id + usuário + status approved + hash do payload + uso único atômico. |
| `rate_limit` | sim | Chamadas são limitadas por janela deslizante por usuário/grant. |
| `audit_trail` | sim | Toda execução gera evidência auditável (audit_events / mission evidence). |
| `sandbox_isolation` | sim | Operações de arquivo ficam confinadas ao namespace do usuário/missão. |
| `path_validation` | sim | Caminhos são validados contra traversal, absolutos e escape por symlink. |
| `dod_evidence` | sim | Conclusão de missão exige evidência verificável (Definition of Done). |

## Resumo por provedor

| Provedor | Capacidades | Leituras | Escritas | Habilitadas e completas |
| --- | --- | --- | --- | --- |
| `cloudflare` | 6 | 4 | 2 | 6 |
| `github` | 16 | 11 | 5 | 16 |
| `neon` | 3 | 3 | 0 | 3 |
| `render` | 5 | 3 | 2 | 5 |
| `stripe` | 5 | 5 | 0 | 5 |
| `supabase` | 4 | 3 | 1 | 4 |
| `telegram` | 3 | 2 | 1 | 3 |
| `vercel` | 5 | 3 | 2 | 5 |

## Provedor: `cloudflare`

| Capacidade | Modo | Habilitada | Controles exigidos | Evidência |
| --- | --- | --- | --- | --- |
| `zones_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `dns_records_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `pages_projects_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `workers_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `dns_record_create` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail` | lib/connectors/gates.ts#consumeGateForWrite, lib/connectors/gatePayload.ts, app/api/gates/[id]/route.ts |
| `pages_deploy` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail` | lib/connectors/gates.ts#consumeGateForWrite, lib/connectors/gatePayload.ts, app/api/gates/[id]/route.ts |

## Provedor: `github`

| Capacidade | Modo | Habilitada | Controles exigidos | Evidência |
| --- | --- | --- | --- | --- |
| `repos_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `repo_get` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `issues_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `issues_get` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `pulls_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `actions_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `repo_create` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail` | lib/connectors/gates.ts#consumeGateForWrite, lib/connectors/gatePayload.ts, app/api/gates/[id]/route.ts |
| `push_files` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail` | lib/connectors/gates.ts#consumeGateForWrite, lib/connectors/gatePayload.ts, app/api/gates/[id]/route.ts |
| `github.files.write` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail` | lib/connectors/gates.ts#consumeGateForWrite, lib/connectors/gatePayload.ts, app/api/gates/[id]/route.ts |
| `github.branches.list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `github.branches.create` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail` | lib/connectors/gates.ts#consumeGateForWrite, lib/connectors/gatePayload.ts, app/api/gates/[id]/route.ts |
| `github.prs.create` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail` | lib/connectors/gates.ts#consumeGateForWrite, lib/connectors/gatePayload.ts, app/api/gates/[id]/route.ts |
| `github.prs.list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `github.prs.get` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `github.code.search` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `github.tree` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |

## Provedor: `neon`

| Capacidade | Modo | Habilitada | Controles exigidos | Evidência |
| --- | --- | --- | --- | --- |
| `projects_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `branches_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `databases_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |

## Provedor: `render`

| Capacidade | Modo | Habilitada | Controles exigidos | Evidência |
| --- | --- | --- | --- | --- |
| `services_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `service_get` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `deploys_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `deploy_trigger` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail` | lib/connectors/gates.ts#consumeGateForWrite, lib/connectors/gatePayload.ts, app/api/gates/[id]/route.ts |
| `env_set` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail` | lib/connectors/gates.ts#consumeGateForWrite, lib/connectors/gatePayload.ts, app/api/gates/[id]/route.ts |

## Provedor: `stripe`

| Capacidade | Modo | Habilitada | Controles exigidos | Evidência |
| --- | --- | --- | --- | --- |
| `balance_get` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `products_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `customers_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `charges_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `subscriptions_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |

## Provedor: `supabase`

| Capacidade | Modo | Habilitada | Controles exigidos | Evidência |
| --- | --- | --- | --- | --- |
| `projects_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `tables_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `table_read` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail`, `input_sanitization` | lib/connectors/supabaseFilters.ts |
| `sql_exec` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail` | lib/connectors/gates.ts#consumeGateForWrite, lib/connectors/gatePayload.ts, app/api/gates/[id]/route.ts |

## Provedor: `telegram`

| Capacidade | Modo | Habilitada | Controles exigidos | Evidência |
| --- | --- | --- | --- | --- |
| `send_message` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail`, `input_sanitization` | lib/runtime/tools/telegram.ts#runTelegram, lib/connectors/manifests/telegram.ts |
| `get_updates` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `get_me` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |

## Provedor: `vercel`

| Capacidade | Modo | Habilitada | Controles exigidos | Evidência |
| --- | --- | --- | --- | --- |
| `projects_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `deployments_list` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `deployment_get` | read | sim | `capability_allowlist`, `output_sanitization`, `audit_trail` | lib/connectors/runRestCapability.ts, lib/mcp/audit.ts |
| `project_create` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail` | lib/connectors/gates.ts#consumeGateForWrite, lib/connectors/gatePayload.ts, app/api/gates/[id]/route.ts |
| `deploy_create` | write | sim | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `write_gate`, `gate_server_validation`, `rate_limit`, `audit_trail` | lib/connectors/gates.ts#consumeGateForWrite, lib/connectors/gatePayload.ts, app/api/gates/[id]/route.ts |

## Tools internas (não-conector)

Também avaliadas de forma fail-closed pelo dispatcher (`evaluateInternalTool`).

| Tool | Controles exigidos |
| --- | --- |
| `note` | `capability_allowlist`, `output_sanitization` |
| `filesystem` | `capability_allowlist`, `input_sanitization`, `output_sanitization`, `sandbox_isolation`, `path_validation`, `audit_trail` |
| `files.export_pdf` | `capability_allowlist`, `output_sanitization`, `sandbox_isolation` |
| `files.export_xlsx` | `capability_allowlist`, `output_sanitization`, `sandbox_isolation` |
| `files.export_markdown` | `capability_allowlist`, `output_sanitization`, `sandbox_isolation` |
| `files.export_html` | `capability_allowlist`, `output_sanitization`, `input_sanitization`, `sandbox_isolation` |

## Garantias verificadas em teste

- `assertRegistryCoverage()` — todo capability de manifesto está declarado e vice-versa.
- Escrita sem gate aprovado, com gate de outro usuário, com payload alterado ou com gate já consumido é **recusada**.
- `files.export_html` neutraliza `<script>`, `on*` e URLs com esquema não permitido.
- Filtros do Supabase recusam parâmetros reservados (`limit`, `select`, `order`, …).
- Agent loop interrompe por repetição de tool, output idêntico, orçamento de tempo e teto acumulado.
