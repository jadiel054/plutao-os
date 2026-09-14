"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CockpitPage() {
  const router = useRouter();
  useEffect(() => {
    // temporary: page under restore
  }, [router]);
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-[var(--base)] text-[var(--text-primary)] p-8">
      <h1 className="text-xl font-bold">Cockpit em restauração</h1>
      <p className="text-sm text-[var(--text-muted)] text-center max-w-md">
        Estamos restaurando a página completa do cockpit (timeline, execução e autonomia).
        Atualize em alguns instantes.
      </p>
      <a href="/chat" className="text-sm text-[var(--selo)] underline">Ir para o Chat</a>
    </div>
  );
}
