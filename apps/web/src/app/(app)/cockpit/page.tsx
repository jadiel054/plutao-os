"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MissionRow = {
  id: string;
  objective: string;
  status: string;
  currentState: string;
  definitionOfDone: string | null;
  createdAt: string;
  updatedAt: string;
};

type User = { id: string; email: string; name: string | null };

const NEXT: Record<string, string[]> = {
  CREATED: ["UNDERSTANDING"],
  UNDERSTANDING: ["PLANNING", "BLOCKED", "FAILED"],
  PLANNING: ["EXECUTING", "BLOCKED", "FAILED"],
  EXECUTING: ["VERIFYING", "CORRECTING", "BLOCKED", "FAILED"],
  VERIFYING: ["COMPLETED", "CORRECTING", "BLOCKED", "FAILED"],
  CORRECTING: ["EXECUTING", "VERIFYING", "BLOCKED", "FAILED"],
  BLOCKED: ["UNDERSTANDING", "PLANNING", "EXECUTING", "FAILED"],
};

export default function CockpitPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [objective, setObjective] = useState("");
  const [definitionOfDone, setDefinitionOfDone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const me = await fetch("/api/auth/me");
    if (!me.ok) {
      router.replace("/login");
      return;
    }
    const meData = await me.json();
    setUser(meData.user);

    const res = await fetch("/api/missions");
    if (!res.ok) {
      setError("Falha ao carregar missões");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setMissions(data.missions ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective,
          definitionOfDone: definitionOfDone || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar");
        return;
      }
      setObjective("");
      setDefinitionOfDone("");
      await load();
    } catch {
      setError("Erro de rede");
    } finally {
      setCreating(false);
    }
  }

  async function onCancel(id: string) {
    if (!confirm("Cancelar esta missão?")) return;
    const res = await fetch(`/api/missions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (res.ok) await load();
  }

  async function onTransition(id: string, toStatus: string) {
    const res = await fetch(`/api/missions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "transition", toStatus }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Transição recusada");
      return;
    }
    await load();
  }

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-[var(--text-muted)] text-sm">
        Carregando cockpit…
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[var(--selo)] flex items-center justify-center text-sm font-bold text-[var(--base)]">P</div>
            <span className="font-semibold tracking-tight">Cockpit</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[var(--text-muted)] font-mono truncate max-w-[10rem]">{user?.email}</span>
            <button type="button" onClick={() => void onLogout()} className="text-[var(--nucleo)] hover:underline">Sair</button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-3xl w-full px-4 py-8 space-y-8">
        <section className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Missões</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Phase 2 · Lifecycle — avance estados manualmente (sem Agent Runtime ainda).
          </p>
        </section>

        <form onSubmit={onCreate} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div className="text-xs font-mono text-[var(--text-muted)]">NOVA MISSÃO</div>
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--text-muted)]">Objetivo</span>
            <textarea required minLength={3} rows={3} value={objective} onChange={(e) => setObjective(e.target.value)}
              placeholder="O que deve ser alcançado?"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm outline-none focus:border-[var(--selo)] resize-y" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--text-muted)]">Definition of Done (opcional)</span>
            <input value={definitionOfDone} onChange={(e) => setDefinitionOfDone(e.target.value)}
              placeholder="Como saber que terminou?"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm outline-none focus:border-[var(--selo)]" />
          </label>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button type="submit" disabled={creating}
            className="rounded-lg bg-[var(--selo)] text-[var(--base)] font-medium px-4 py-2 text-sm hover:bg-[var(--nucleo)] disabled:opacity-60">
            {creating ? "Criando…" : "Criar missão"}
          </button>
        </form>

        <section className="space-y-3">
          <div className="text-xs font-mono text-[var(--text-muted)]">LISTA</div>
          {missions.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] border border-dashed border-[var(--border)] rounded-lg p-6 text-center">
              Nenhuma missão ainda.
            </p>
          ) : (
            <ul className="space-y-3">
              {missions.map((m) => {
                const advances = NEXT[m.status] ?? [];
                const terminal = m.status === "CANCELLED" || m.status === "COMPLETED" || m.status === "FAILED";
                return (
                  <li key={m.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium leading-snug">{m.objective}</p>
                      <span className="shrink-0 text-[10px] font-mono uppercase tracking-wide rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--nucleo)]">{m.status}</span>
                    </div>
                    {m.definitionOfDone && <p className="text-xs text-[var(--text-muted)]">DoD: {m.definitionOfDone}</p>}
                    <div className="flex flex-wrap gap-2">
                      {advances.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => void onTransition(m.id, s)}
                          className="text-[10px] font-mono uppercase rounded border border-[var(--border)] px-2 py-1 text-[var(--text-secondary)] hover:border-[var(--selo)] hover:text-[var(--nucleo)]"
                        >
                          → {s}
                        </button>
                      ))}
                      {!terminal && (
                        <button type="button" onClick={() => void onCancel(m.id)} className="text-[10px] font-mono uppercase text-[var(--danger)] hover:underline px-1">
                          Cancelar
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] font-mono">
                      {new Date(m.createdAt).toLocaleString("pt-BR")}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="text-center text-xs text-[var(--text-muted)]">
          <Link href="/" className="hover:text-[var(--nucleo)]">← Início</Link>
        </p>
      </main>
    </div>
  );
}
