# G2 — wiring obrigatório em `apps/web/src/app/api/chat/route.ts`

O painel e o `persistChatMessages` já emitem events. O `route.ts` em main ainda tem um `persistMessagePair` **local** que **não** emite. Aplicar antes do merge (ou usar o arquivo completo em `artifacts` do agente).

## Diff mínimo

1. Após o import de credentials:

```ts
import { persistMessagePair as persistMessagePairLib } from "@/lib/chat/persistChatMessages";
import { emitConnectorToolEvents } from "./emitConnectorToolEvents";
```

2. Substituir o corpo da função local `persistMessagePair` por:

```ts
  return persistMessagePairLib(db, conversationId, userText, assistantText);
```

3. Após **cada** `await persistMessagePair(db, activeConversationId, lastUserText, assistantContent);` (stream e non-stream):

```ts
  await emitConnectorToolEvents(activeConversationId, toolRunRes);
```

## Por que não no mesmo commit automático

O `route.ts` (~49 KB) excedeu o limite prático de um único push via connector neste ciclo; o helper `emitConnectorToolEvents.ts` e o painel já estão na branch. O wiring acima é o que liga o chat web ao feed.

## Aceite

Após apply: mensagem no chat → eventos `user_message`/`assistant_message` na conversa; tool github/vercel → `action`+`observation`; painel “Computador” mostra ao vivo.
