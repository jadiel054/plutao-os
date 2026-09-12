# CURRENT_STATE.md — Plutão

**Última atualização:** 2026-09-12

## Fase

Runtime completo (Phases 1–3 + loop + tools + model provider) **VERIFIED** / model real **PENDING key**.  
**Agent profile + mission evidence** → **VERIFIED** (prod).

## Matriz

| Área | Status |
|------|--------|
| Durable Runtime / Loop / Tools / Cockpit | VERIFIED |
| Model provider code | IMPLEMENTED |
| LLM real | PENDING `MODEL_API_KEY` |
| `GET/PUT /api/agent` | **VERIFIED** |
| `GET /api/missions/:id/evidence` | **VERIFIED** |
| Agent no system prompt do model-step | IMPLEMENTED |
| **Filesystem Tool V1** | **IMPLEMENTED** |

## Filesystem Tool V1

### Status: IMPLEMENTED ✅

### Operações Disponíveis
- `filesystem.list` - Lista conteúdo de diretórios
- `filesystem.read` - Lê arquivos de texto
- `filesystem.write` - Escreve/Cria arquivos de texto
- `filesystem.mkdir` - Cria diretórios
- `filesystem.stat` - Verifica existência e tipo de caminho

### Sandbox
- **Raiz padrão:** `apps/web/sandbox` (configurável via `FILESYSTEM_SANDBOX_ROOT`)
- **Segurança:** Path traversal bloqueado, caminhos absolutos rejeitados, symlink escape tratado
- **Isolamento:** Todas as operações restritas à raiz da sandbox

### Limites
- **Tamanho máximo de arquivo:** 1MB (1024 * 1024 bytes)
- **Operações:** Somente leitura/escrita de arquivos de texto
- **Idempotência:** Suportada via mecanismo existente do Tool Dispatcher

### Erros Estruturados
- `PATH_OUTSIDE_SANDBOX` - Caminho fora da sandbox
- `PATH_TRAVERSAL` - Tentativa de traversal detectada
- `SYMLINK_ESCAPE` - Escape por symlink detectado
- `INVALID_INPUT` - Entrada inválida
- `FILE_TOO_LARGE` - Arquivo excede limite de tamanho
- `WRITE_TOO_LARGE` - Conteúdo excede limite de tamanho
- `FILE_NOT_FOUND` - Arquivo não encontrado
- `NOT_A_FILE` - Caminho não é um arquivo
- `NOT_A_DIRECTORY` - Caminho não é um diretório
- `PERMISSION_DENIED` - Permissão negada
- `UNSUPPORTED_OPERATION` - Operação não suportada

### Como Testar
```bash
# Executar testes específicos
node --test apps/web/src/lib/runtime/tools/__tests__/filesystem.test.ts

# Ou executar todos os testes (se configurado)
npm test
```

### Exemplos de Chamadas

#### Listar diretório
```json
{
  "name": "filesystem",
  "input": "{\"action\":\"list\",\"payload\":{\"path\":\".\"}}"
}
```

#### Ler arquivo
```json
{
  "name": "filesystem",
  "input": "{\"action\":\"read\",\"payload\":{\"path\":\"notes/example.txt\"}}"
}
```

#### Escrever arquivo
```json
{
  "name": "filesystem",
  "input": "{\"action\":\"write\",\"payload\":{\"path\":\"notes/example.txt\",\"content\":\"hello plutao\"}}"
}
```

#### Criar diretório
```json
{
  "name": "filesystem",
  "input": "{\"action\":\"mkdir\",\"payload\":{\"path\":\"projects/demo\"}}"
}
```

#### Verificar status de caminho
```json
{
  "name": "filesystem",
  "input": "{\"action\":\"stat\",\"payload\":{\"path\":\"notes/example.txt\"}}"
}
```

### Limitações Atuais
- Somente arquivos de texto (UTF-8)
- Não suporta operações binárias
- Não suporta streams para arquivos grandes
- Symlink escape tratado mas pode ter limitações em sistemas específicos
- Não implementa: shell, git, web, MCP, browser, uploads, execução de código

## Próximo marco recomendado

Teste controlado com key: mission → execution → model step → tool (note + filesystem) → evidence → checkpoint.
