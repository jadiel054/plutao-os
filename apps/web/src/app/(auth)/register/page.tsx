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
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <BrandMark size={52} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Criar conta</h1>
          <p className="text-xs text-[var(--text-muted)]">Comece a operar com o Plutão</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
          <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Nome (opcional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--selo)] transition-colors bg-[var(--base)] text-[var(--text-primary)]"
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
            <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/20 text-red-400 text-xs" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[var(--selo)] text-[var(--base)] font-semibold py-3 text-sm hover:bg-[var(--nucleo)] transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Criando conta…" : "Criar conta"}
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
