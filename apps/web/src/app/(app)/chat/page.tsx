"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Placeholder temporário — a página completa com card Conectar/Pular
 * está sendo reaplicada. Redireciona ao cockpit para não deixar o app quebrado.
 * API /api/chat já devolve suggestedConnectors.
 */
function ChatRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/cockpit");
  }, [router]);
  return (
    <div className="min-h-dvh flex items-center justify-center text-[var(--text-muted)] text-sm font-mono px-4 text-center">
      Chat em atualização — redirecionando…
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center text-[var(--text-muted)] text-sm font-mono">
          Carregando…
        </div>
      }
    >
      <ChatRedirect />
    </Suspense>
  );
}
