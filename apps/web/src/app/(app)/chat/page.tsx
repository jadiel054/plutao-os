"use client";

import { Suspense } from "react";

/**
 * TEMPORARY STUB — full chat page was overwritten by PLACEHOLDER in a bad push.
 * Restore full content from artifacts/chat_page_WriteGateCard.tsx or parent of 5b8b685.
 * Do not leave this stub in production beyond the recovery window.
 */
function ChatStub() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--base,#0B0D0C)] text-[var(--papel,#F5F3EE)] p-6">
      <div className="max-w-md space-y-3 text-center">
        <p className="text-sm font-mono text-[var(--selo,#5FA88C)]">CHAT · RECOVERY</p>
        <h1 className="text-lg font-semibold">Página do chat em restauração</h1>
        <p className="text-xs text-[var(--text-muted,#5FA88C)] leading-relaxed">
          O arquivo page.tsx foi sobrescrito por engano. O conteúdo completo com WriteGateCard
          está pronto para reaplicação. Migration write_gates no Neon já está aplicada.
        </p>
        <a href="/" className="inline-block mt-2 text-sm underline text-[var(--nucleo,#9CD9C2)]">
          Voltar à landing
        </a>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm font-mono">Carregando…</div>}>
      <ChatStub />
    </Suspense>
  );
}
