"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GuestButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGuestAccess = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Falha ao iniciar sessão como convidado.");
        setLoading(false);
        return;
      }
      router.push("/chat");
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5 w-full">
      <button
        type="button"
        onClick={handleGuestAccess}
        disabled={loading}
        className="w-full rounded-2xl border border-dashed border-[var(--border)] px-6 py-3 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--selo)]/50 hover:bg-[var(--surface)] transition-all cursor-pointer disabled:opacity-50"
      >
        {loading ? "Iniciando sessão..." : "Explorar como convidado"}
      </button>
      {error && <p className="text-[11px] text-[var(--danger)] font-mono">{error}</p>}
    </div>
  );
}
