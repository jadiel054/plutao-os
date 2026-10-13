"use client";

import { useCallback, useEffect, useState } from "react";
import type { AutonomyMode } from "@/lib/agente/autonomy";

type Props = {
  onNotify: (message: string, type?: "success" | "info" | "warning" | "error", title?: string) => void;
};

const MODES: {
  id: AutonomyMode;
  title: string;
  description: string;
  risk: "low" | "medium" | "high";
}[] = [
  {
    id: "standard",
    title: "Padrão",
    description:
      "Toda escrita externa cria um Write Gate. Você aprova no card do chat antes de qualquer efeito real.",
    risk: "low",
  },
  {
    id: "elevated",
    title: "Elevada",
    description:
      "Auto-aprova escritas de baixo risco (branch, arquivos, PRs, notes, exports). Deploy, SQL e deletes continuam pedindo aprovação.",
    risk: "medium",
  },
  {
    id: "full",
    title: "Total",
    description:
      "Auto-aprova quase todas as escritas. Só bloqueia operações destrutivas (delete, DROP, force-push, deploys de produção na denylist). Use com cuidado.",
    risk: "high",
  },
];

export function SettingsAutonomySection({ onNotify }: Props) {
  const [mode, setMode] = useState<AutonomyMode>("standard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/user/preferences", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const m = data?.preferences?.autonomyMode;
      if (m === "full" || m === "elevated" || m === "standard") setMode(m);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: AutonomyMode) => {
    setSaving(true);
    const prev = mode;
    setMode(next);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autonomyMode: next }),
      });
      if (!res.ok) {
        setMode(prev);
        const err = await res.json().catch(() => ({}));
        onNotify(err.error ?? "Falha ao salvar autonomia", "error");
        return;
      }
      onNotify(
        next === "full"
          ? "Autonomia total ativa — escritas não destrutivas serão auto-aprovadas"
          : next === "elevated"
            ? "Autonomia elevada ativa — allowlist auto-aprovada"
            : "Autonomia padrão — aprovação humana em toda escrita",
        next === "full" ? "warning" : "success",
        "Autonomia"
      );
    } catch {
      setMode(prev);
      onNotify("Erro de rede ao salvar autonomia", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="text-xs text-[var(--text-muted)] font-mono">Carregando autonomia…</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-5 animate-in fade-in duration-200">
      <div className="pb-3 border-b border-[var(--border)]">
        <h2 className="text-base font-semibold">Autonomia do agente</h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Controla se o Nix precisa de aprovação humana (Write Gate) antes de cada escrita. Gates
          continuam sendo registrados para auditoria mesmo quando auto-aprovados.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {MODES.map((m) => {
          const active = mode === m.id;
          const riskColor =
            m.risk === "high"
              ? "border-amber-500/50 bg-amber-500/5"
              : m.risk === "medium"
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-[var(--border)]";
          return (
            <button
              key={m.id}
              type="button"
              disabled={saving}
              onClick={() => void save(m.id)}
              className={`text-left rounded-xl border p-4 transition-all cursor-pointer disabled:opacity-50 ${
                active
                  ? `${riskColor} ring-1 ring-[var(--selo)]`
                  : "border-[var(--border)] bg-[var(--base)] hover:border-[var(--selo)]/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{m.title}</span>
                {active && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-[var(--selo)]/20 text-[var(--selo)]">
                    ATIVO
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">{m.description}</p>
            </button>
          );
        })}
      </div>

      {mode === "full" && (
        <p className="text-[11px] font-mono text-amber-400/90 border border-amber-500/30 rounded-lg px-3 py-2">
          Modo total: o agente executa escritas sem card de aprovação. Operações na denylist
          (delete, SQL livre, deploys) ainda pedem confirmação.
        </p>
      )}
    </section>
  );
}
