# G3 — uma linha no chat/page.tsx

Em `apps/web/src/app/(app)/chat/page.tsx`, no `MissionWorkspaceBar`:

```tsx
<MissionWorkspaceBar
  key={workspaceKey}
  missionId={activeMissionId}
  conversationId={activeConversationId}
  onNotify={(msg, type) => addToast(msg, type ?? "info")}
/>
```

Sem `conversationId`, o runtime da missão **não** emite action/observation e o Computador fica mudo durante a missão.
