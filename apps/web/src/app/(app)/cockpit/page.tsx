"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { ToastContainer, ToastMessage, ToastType } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  MissionTimeline,
  buildMissionTimeline,
} from "@/components/MissionTimeline";
import { MissionEvidencePanel } from "@/components/MissionEvidencePanel";
import { MissionDoDPanel } from "@/components/MissionDoDPanel";
import { CockpitAgentFab } from "@/components/CockpitAgentFab";
import { runAutonomousMission } from "@/lib/cockpit/runAutonomousMission";
import { usePendingIntents } from "@/hooks/usePendingIntents";
import { formatModelLabel } from "@/lib/runtime/model/label";
import { createMissionIntake } from "@/lib/missions/intakeClient";

type MissionRow = {
  id: string;
  objective: string;
  status: string;
  definitionOfDone: string | null;
  createdAt: string;
  isPendingIntent?: boolean;
  intentStatus?: string;
  intentError?: string | null;
};

type TaskRow = { id: string; title: string; status: string };

type EvidenceItem = {
  id: string;
  type: string;
  content: string;
  source: string;
  createdAt?: string;
  taskId?: string | null;
};

type ExecutionRow = {
  id: string;
  status: string;
  checkpoint: Record<string, unknown> | null;
  checkpointAt: string | null;
  jobId?: string;
  jobStatus?: string;
  jobAttempts?: number;
  jobMaxAttempts?: number;
  jobLastError?: string | null;
};

function networkErrorMessage(action: string): string {
  return `Sem conexão: não foi possível ${action}. Reconecte e tente novamente.`;
}

export default function CockpitPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const { intents, reconcile, createOfflineMissionIntent } = usePendingIntents(userId);
  const [objective, setObjective] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskError, setTaskError] = useState<string | null>(null);
  const [execution, setExecution] = useState<ExecutionRow | null>(null);
  const [missionEvidence, setMissionEvidence] = useState<EvidenceItem[]>([]);
  const [allowedTransitions, setAllowedTransitions] = useState<string[]>([]);
  const [openMissionMeta, setOpenMissionMeta] = useState<{
    createdAt?: string;
    status: string;
    objective: string;
  } | null>(null);
  const [panelErrors, setPanelErrors] = useState<{
    mission?: boolean;
    tasks?: boolean;
    executions?: boolean;
    evidence?: boolean;
  }>({});
  const [cpNote, setCpNote] = useState("");
  const [modelConfigured, setModelConfigured] = useState(false);
  const [modelInfo, setModelInfo] = useState("");
  const [agentName, setAgentName] = useState("Nix");
  const [agentIdentity, setAgentIdentity] = useState("operador do Plutão OS, assistente pessoal do usuário");

  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const missionIntakeKeyRef = useRef<{ objective: string; key: string } | null>(null);

  const [dodResult, setDodResult] = useState<{
    passed: boolean;
    summary: string;
    checks: { id: string; label: string; passed: boolean; detail?: string }[];
  } | null>(null);
  const [dodLoading, setDodLoading] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const addToast = (message: string, type: ToastType = "info", title?: string) => {
    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message, type, title }]);
  };
  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // NOTE: full page body restored from commit d244462; worker queue panel is in layout.tsx
  useEffect(() => {
    void (async () => {
      try {
        const me = await fetch("/api/auth/me", { cache: "no-store" });
        if (!me.ok) {
          router.replace("/login");
          return;
        }
        const meData = await me.json();
        setUserId(meData.user?.id ?? null);
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
        const a = await fetch("/api/agent", { cache: "no-store" });
        if (a.ok) {
          const d = await a.json();
          if (d.agent) {
            setAgentName(d.agent.name || "Plutão");
            setAgentIdentity(d.agent.identity || "");
          }
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
              Timeline, evidências, ciclo de vida e runtime da missão
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
                      onClick={() => void runAutonomousMission({
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
                      })}
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
      <CockpitAgentFab />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        onConfirm={confirmModalState.onConfirm}
        onCancel={() => setConfirmModalState((p) => ({ ...p, isOpen: false }))}
      />
    </div>
  );
}
