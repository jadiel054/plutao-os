# Teste offline mobile — resultado real

**Data:** 14/09/2026  
**Produção:** [https://plutao-os.vercel.app/cockpit](https://plutao-os.vercel.app/cockpit)  
**Dispositivo/navegador:** Android, Google Chrome mobile  
**Missão observada:** `Criar notes/auto-v11.txt com o conteúdo exato AUTO_V11`  
**MissionId da missão:** `5be0e69b-6f65-47ae-a442-6e86de47acca`

## Resultado

| Verificação | Resultado |
|---|---|
| Banner Offline no topo | ✅ Confirmado |
| Status visual de conectividade | ✅ Exibiu `Sem conexão` |
| Missão COMPLETED legível | ✅ Confirmado |
| Timeline legível | ✅ Confirmado |
| Evidências legíveis | ✅ Confirmado |
| Badge DoD `PASSED` | ✅ Confirmado na sessão observada |
| Tela branca | ❌ Não ocorreu |
| Criar missão sem conexão — primeira versão | ❌ Falha silenciosa; corrigido depois |
| Criar missão sem conexão — pós-deploy | ✅ Toast de erro controlado confirmado |
| Reconciliação automática | ❌ Não observada |

## Evidência

A captura [`evidencia-banner-offline-falha-criar-missao.jpg`](evidencia-banner-offline-falha-criar-missao.jpg) mostra simultaneamente:

- banner amarelo: `Offline — a interface continua...`
- indicador no cabeçalho: `Sem conexão`
- cockpit e missão COMPLETED ainda legíveis
- timeline e evidências ainda legíveis
- formulário de criação de missão sem resposta visível após a tentativa offline

## Diagnóstico técnico

O comportamento silencioso foi reproduzido por inspeção do código da produção correspondente à versão auditada. O handler `onCreate` executava `fetch("/api/missions", ...)` dentro de `try/finally`, mas não possuía `catch`. Quando o navegador está offline, `fetch()` rejeita com erro de rede antes de receber uma resposta HTTP; por isso não havia `setError`, toast, estado `PENDING` ou fila de sincronização.

A correção foi implementada no branch `main` local: handlers de criação de missão, execução autônoma, runtime, transições, tarefas, perfil e ações de execução agora convertem falhas de rede em mensagem visual:

```text
Sem conexão: não foi possível <ação>. Reconecte e tente novamente.
```

A correção foi publicada no Vercel e validada novamente em produção. Esta alteração **não implementa fila offline ou sincronização posterior**; ela corrige a falha silenciosa e fornece erro controlado, conforme o roteiro V1.

## Validação local da correção

- `npm install --no-audit --no-fund` — concluído.
- `npm run build` — passou; o build compilou e gerou as rotas da aplicação.
- `npm run lint` — passou com um warning preexistente em `ModelStatusIndicator.tsx:350` (`error` não utilizado).
- `npm run typecheck` — passou em `packages/domain` e `packages/db`.

## Validação pós-deploy

O usuário repetiu o teste em Android/Chrome mobile após a publicação da correção. A tentativa de criar missão sem conexão exibiu corretamente:

```text
Sem conexão: não foi possível criar a missão. Reconecte e tente novamente.
```

O cockpit permaneceu legível, sem tela branca, e as missões existentes continuaram visíveis. Evidência: [`evidencia-toast-offline-pos-deploy.jpg`](evidencia-toast-offline-pos-deploy.jpg).

**Status final do Roteiro A:** ✅ **VERIFIED**.

## Próximos passos

1. Validar build e testes locais.
2. Commitar a correção e publicar na produção.
3. Repetir o teste em modo avião.
4. Confirmar toast de erro ao criar/executar missão offline.
5. Manter como pendência separada a implementação de `Pending Intents`/reconciliação, caso a intenção seja criar missões offline e sincronizá-las depois.
