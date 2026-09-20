"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BrandMark } from "@/components/BrandMark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [showMagicForm, setShowMagicForm] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
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

  async function onSubmitMagicLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setMagicLoading(true);
    try {
      const res = await fetch("/api/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: magicLinkEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao solicitar link de acesso");
        return;
      }
      setMessage(data.message || "Link enviado com sucesso!");
    } catch {
      setError("Erro de rede ao solicitar link de acesso");
    } finally {
      setMagicLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 bg-[var(--base)] text-[var(--text-primary)]">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <BrandMark size={52} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Entrar no Plutão</h1>
          <p className="text-xs text-[var(--text-muted)]">Acesse seu espaço de missões</p>
        </div>

        {/* Social Login Buttons */}
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
            Continuar com Google
          </a>

          <a
            href="/api/auth/github/authorize"
            className="flex items-center justify-center gap-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] font-medium py-2.5 text-sm transition-colors text-[var(--text-primary)] cursor-pointer"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continuar com GitHub
          </a>
        </div>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-[var(--border)]"></div>
          <span className="flex-shrink mx-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">ou</span>
          <div className="flex-grow border-t border-[var(--border)]"></div>
        </div>

        {/* Magic Link Toggle / Form */}
        {showMagicForm ? (
          <form onSubmit={onSubmitMagicLink} className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-primary)]">Entrar com Magic Link</span>
              <button
                type="button"
                onClick={() => setShowMagicForm(false)}
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Usar senha
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">E-mail</span>
              <input
                type="email"
                required
                value={magicLinkEmail}
                onChange={(e) => setMagicLinkEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--selo)] transition-colors"
              />
            </label>
            <button
              type="submit"
              disabled={magicLoading}
              className="w-full rounded-xl bg-[var(--selo)] text-[var(--base)] font-semibold py-2.5 text-sm hover:bg-[var(--nucleo)] transition-all disabled:opacity-50 cursor-pointer"
            >
              {magicLoading ? "Enviando..." : "Enviar link por e-mail"}
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmitPassword} className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
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
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Senha</span>
                <button
                  type="button"
                  onClick={() => {
                    setMagicLinkEmail(email);
                    setShowMagicForm(true);
                  }}
                  className="text-[10px] text-[var(--selo)] hover:underline"
                >
                  Entrar sem senha (Magic Link)
                </button>
              </div>
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

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[var(--selo)] text-[var(--base)] font-semibold py-3 text-sm hover:bg-[var(--nucleo)] transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Autenticando…" : "Entrar com e-mail"}
            </button>
          </form>
        )}

        {error && (
          <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/20 text-red-400 text-xs text-center" role="alert">
            {error}
          </div>
        )}

        {message && (
          <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/20 text-emerald-400 text-xs text-center" role="status">
            {message}
          </div>
        )}

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
