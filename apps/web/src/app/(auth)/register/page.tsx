"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || null, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha no cadastro");
        return;
      }
      router.push("/cockpit");
      router.refresh();
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex w-10 h-10 rounded-full bg-[var(--selo)] items-center justify-center text-sm font-bold text-[var(--base)]">P</div>
          <h1 className="text-xl font-semibold">Criar conta</h1>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--text-muted)] font-mono">NOME (opcional)</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm outline-none focus:border-[var(--selo)]" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--text-muted)] font-mono">E-MAIL</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm outline-none focus:border-[var(--selo)]" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--text-muted)] font-mono">SENHA (mín. 8)</span>
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm outline-none focus:border-[var(--selo)]" />
          </label>
          {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-[var(--selo)] text-[var(--base)] font-medium py-2.5 text-sm hover:bg-[var(--nucleo)] disabled:opacity-60">
            {loading ? "Criando…" : "Criar conta"}
          </button>
        </form>
        <p className="text-center text-sm text-[var(--text-secondary)]">
          Já tem conta? <Link href="/login" className="text-[var(--nucleo)] hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
