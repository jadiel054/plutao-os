"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { ToastContainer, ToastMessage, ToastType } from "@/components/Toast";
import { CockpitAgentFab } from "@/components/CockpitAgentFab";
import { runAutonomousMission } from "@/lib/cockpit/runAutonomousMission";
import { formatModelLabel } from "@/lib/runtime/model/label";
import { createMissionIntake } from "@/lib/missions/intakeClient";

type MissionRow = {
  id: string;
  objective: string;
  status: string;
  definitionOfDone: string | null;
  createdAt: string;
};

export default function CockpitPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [objective, setObjective] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modelConfigured, setModelConfigured] = useState(false);
  const [modelInfo, setModelInfo] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: ToastType = "info", title?: string) => {
    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message, type, title }]);
  };
  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetch("/api/auth/me", { cache: "no-store" });
        if (!me.ok) {
          router.replace("/login");
          return;
        }
        const meData = await me.json();
        setUserEmail(meData.user?.email ?? "");
        const res = await fetch("/api/missions", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setMissions(data.missions ?? []);
        }
      } catch {
        setError("Erro de rede ao carregar cockpit");
      } finally {
        setLoading(false);
      }
    })();
    void (async () => {
      try {
        const s = await fetch("/api/model/status", { cache: "no-store" });
        if (s.ok) {
          const d = await s.json();
          setModelConfigured(!!d.configured);
          if (d.configured) setModelInfo(d.label ?? formatModelLabel(d.provider, d.model));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-[var(--text-muted)] text-sm font-mono">
        Carregando cockpit…
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--base)] text-[var(--text-primary)] pb-20 sm:pb-8">
      <Header userEmail={userEmail} onNotify={(msg, type) => addToast(msg, type)} />
      <main className="flex-1 mx-auto max-w-4xl w-full px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)] pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cockpit de Operações</h1>
            <p className="text-xs text-[var(--text-muted)]">
              Fila do worker, missões e execução autônoma
            </p>
          </div>
          <div className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-mono text-[var(--selo)] self-start sm:self-auto">
            Missões: {missions.length}
          </div>
        </div>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3 shadow-xs">
          <div className="text-xs font-mono font-semibold text-[var(--text-muted)]">MODELO</div>
          <p className="text-xs font-mono text-[var(--selo)]">
            {modelConfigured ? modelInfo || "configurado" : "não configurado — defina MODEL_API_KEY"}
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
          <h2 className="text-sm font-semibold">Nova missão</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                if (!objective.trim()) return;
                setActionBusy("create_mission");
                try {
                  const res = await createMissionIntake({
                    objective: objective.trim(),
                    source: "cockpit",
                    idempotencyKey: crypto.randomUUID(),
                  });
                  if (!res.ok) {
                    addToast("Falha ao criar missão", "error");
                    return;
                  }
                  setObjective("");
                  addToast("Missão criada", "success");
                  const list = await fetch("/api/missions", { cache: "no-store" });
                  if (list.ok) {
                    const data = await list.json();
                    setMissions(data.missions ?? []);
                  }
                } catch {
                  addToast("Erro de rede", "error");
                } finally {
                  setActionBusy(null);
                }
              })();
            }}
            className="space-y-3"
          >
            <textarea
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm min-h-[80px]"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Objetivo da missão…"
            />
            <button
              type="submit"
              disabled={!!actionBusy || !objective.trim()}
              className="px-4 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold disabled:opacity-50"
            >
              Criar missão
            </button>
          </form>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Missões ({missions.length})</h2>
          {missions.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">Nenhuma missão ainda.</p>
          ) : (
            <ul className="space-y-2">
              {missions.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{m.objective}</p>
                      <p className="text-[10px] font-mono text-[var(--text-muted)]">{m.status}</p>
                    </div>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-lg border border-[var(--border)]"
                      onClick={() =>
                        void runAutonomousMission({
                          missionId: m.id,
                          status: m.status,
                          execution: null,
                          taskId: null,
                          modelConfigured,
                          onStatus: () => {},
                          onExecution: () => {},
                          onEvidence: () => {},
                          onError: (msg) => addToast(msg, "error"),
                          onToast: addToast,
                        })
                      }
                    >
                      ▶ Executar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
      </main>
      <MobileNav />
      <CockpitAgentFab missionId={null} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
