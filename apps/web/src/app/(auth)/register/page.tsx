"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BrandMark } from "@/components/BrandMark";

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
      setError("Erro de rede ao cadastrar usuário");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 bg-[var(--base)] text-[var(--text-primary)]">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <BrandMark size={52} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Criar conta no Plutão</h1>
          <p className="text-xs text-[var(--text-muted)]">Comece a operar com o Plutão</p>
        </div>

        {/* Social Register Buttons */}
        <div className="space-y-2.5">
          <a
            href="/api/auth/google/authorize"
            className="flex items-center justify-center gap-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] font-medium py-2.5 text-sm transition-colors text-[var(--text-primary)] cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
            Criar conta com Google
          </a>

          <a
            href="/api/auth/github/authorize"
            className="flex items-center justify-center gap-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] font-medium py-2.5 text-sm transition-colors text-[var(--text-primary)] cursor-pointer"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Criar conta com GitHub
          </a>
        </div>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-[var(--border)]"></div>
          <span className="flex-shrink mx-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">ou</span>
          <div className="flex-grow border-t border-[var(--border)]"></div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
          <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Nome (opcional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--selo)] transition-colors text-[var(--text-primary)]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--selo)] transition-colors text-[var(--text-primary)]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Senha (mín. 8)</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--selo)] transition-colors text-[var(--text-primary)]"
            />
          </label>

          {error && (
            <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/20 text-red-400 text-xs text-center" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[var(--selo)] text-[var(--base)] font-semibold py-3 text-sm hover:bg-[var(--nucleo)] transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Criando conta…" : "Criar conta com e-mail"}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--text-secondary)]">
          Já tem conta?{" "}
          <Link href="/login" className="text-[var(--selo)] hover:underline font-medium">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
