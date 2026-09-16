"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BrandMark } from "@/components/BrandMark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha no login");
        return;
      }
      router.push("/cockpit");
      router.refresh();
    } catch {
      setError("Erro de rede ao conectar ao servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 bg-[var(--base)] text-[var(--text-primary)]">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <BrandMark size={52} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Entrar</h1>
          <p className="text-xs text-[var(--text-muted)]">Acesse seu espaço de missões</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
          <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--selo)] transition-colors"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Senha</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--selo)] transition-colors"
            />
          </label>

          {error && (
            <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/20 text-red-400 text-xs" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[var(--selo)] text-[var(--base)] font-semibold py-3 text-sm hover:bg-[var(--nucleo)] transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Autenticando…" : "Entrar"}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--text-secondary)]">
          Não tem conta?{" "}
          <Link href="/register" className="text-[var(--selo)] hover:underline font-medium">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
