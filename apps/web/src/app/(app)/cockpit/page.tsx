"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MissionRow = {
  id: string;
  objective: string;
  status: string;
  definitionOfDone: string | null;
  createdAt: string;
};

type TaskRow = { id: string; title: string; status: string };

type EvidenceItem = {
  id: string;
  type: string;
  content: string;
  source: string;
};

type ExecutionRow = {
  id: string;
  status: string;
  checkpoint: Record<string, unknown> | null;
  checkpointAt: string | null;
};

export default function CockpitPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [objective, setObjective] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [execution, setExecution] = useState<ExecutionRow | null>(null);
  const [missionEvidence, setMissionEvidence] = useState<EvidenceItem[]>([]);
  const [cpNote, setCpNote] = useState("");
  const [modelConfigured, setModelConfigured] = useState(false);
  const [modelInfo, setModelInfo] = useState("");
  const [agentName, setAgentName] = useState("Plutão");
  const [agentIdentity, setAgentIdentity] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const me = await fetch("/api/auth/me");
    if (!me.ok) {
      router.replace("/login");
      return;
    }
    const meData = await me.json();
    setUserEmail(meData.user?.email ?? "");
    const res = await fetch("/api/missions");
    if (res.ok) {
      const data = await res.json();
      setMissions(data.missions ?? []);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
    void (async () => {
      const s = await fetch("/api/model/status");
      if (s.ok) {
        const d = await s.json();
        setModelConfigured(!!d.configured);
        if (d.configured) setModelInfo(`${d.provider}/${d.model}`);
      }
      const a = await fetch("/api/agent");
      if (a.ok) {
        const d = await a.json();
        if (d.agent) {
          setAgentName(d.agent.name || "Plutão");
          setAgentIdentity(d.agent.identity || "");
        }
      }
    })();
  }, [load]);

  async function openMission(id: string) {
    if (openId === id) {
      setOpenId(null);
      setTasks([]);
      setExecution(null);
      setMissionEvidence([]);
      return;
    }
    setOpenId(id);
    const [tRes, rRes, eRes] = await Promise.all([
      fetch(`/api/missions/${id}/tasks`),
      fetch(`/api/missions/${id}/executions`),
      fetch(`/api/missions/${id}/evidence`),
    ]);
    if (tRes.ok) {
      const d = await tRes.json();
      setTasks((d.tasks ?? []).map((t: TaskRow) => ({ id: t.id, title: t.title, status: t.status })));
    }
    if (rRes.ok) {
      const d = await rRes.json();
      setExecution(d.recoverable ?? null);
    }
    if (eRes.ok) {
      const d = await eRes.json();
      setMissionEvidence(d.evidence ?? []);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objective }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Falha");
      return;
    }
    setObjective("");
    await load();
  }

  async function saveAgent() {
    setBusy(true);
    try {
      await fetch("/api/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: agentName, identity: agentIdentity }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function refreshOpen() {
    if (openId) await openMission(openId);
  }

  async function startRuntime() {
    if (!openId) return;
    const res = await fetch(`/api/missions/${openId}/executions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentTaskId: tasks[0]?.id ?? null }),
    });
    const d = await res.json();
    if (res.ok) setExecution(d.execution);
    else setError(d.error ?? "Falha runtime");
  }

  async function runtimePatch(action: string, extra?: Record<string, unknown>) {
    if (!execution) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/executions/${execution.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Falha");
        return;
      }
      if (action === "complete" || action === "fail") setExecution(null);
      else setExecution(d.execution);
    } finally {
      setBusy(false);
    }
  }

  async function postExec(path: string, body?: unknown) {
    if (!execution) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/executions/${execution.id}${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await res.json();
      if (!res.ok) {
        setError(
          d.error === "MODEL_NOT_CONFIGURED"
            ? "Configure MODEL_API_KEY no Vercel"
            : d.detail ?? d.error ?? "Falha"
        );
        return;
      }
      if (d.execution) setExecution(d.execution);
      if (openId) {
        const eRes = await fetch(`/api/missions/${openId}/evidence`);
        if (eRes.ok) {
          const ed = await eRes.json();
          setMissionEvidence(ed.evidence ?? []);
        }
        const tRes = await fetch(`/api/missions/${openId}/tasks`);
        if (tRes.ok) {
          const td = await tRes.json();
          setTasks((td.tasks ?? []).map((t: TaskRow) => ({ id: t.id, title: t.title, status: t.status })));
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function addTask() {
    if (!openId || taskTitle.trim().length < 2) return;
    await fetch(`/api/missions/${openId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: taskTitle.trim() }),
    });
    setTaskTitle("");
    const tRes = await fetch(`/api/missions/${openId}/tasks`);
    if (tRes.ok) {
      const td = await tRes.json();
      setTasks((td.tasks ?? []).map((t: TaskRow) => ({ id: t.id, title: t.title, status: t.status })));
    }
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
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <span className="font-semibold tracking-tight">Cockpit</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[var(--text-muted)] font-mono">{userEmail}</span>
            <button
              type="button"
              className="text-[var(--nucleo)]"
              onClick={() => void fetch("/api/auth/logout", { method: "POST" }).then(() => router.replace("/login"))}
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-3xl w-full px-4 py-8 space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Missões · Runtime · Agente</h1>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
          <div className="text-xs font-mono text-[var(--text-muted)]">AGENTE</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Nome"
            />
            <input
              className="flex-[2] rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm"
              value={agentIdentity}
              onChange={(e) => setAgentIdentity(e.target.value)}
              placeholder="Identidade"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveAgent()}
              className="rounded-lg border border-[var(--selo)] text-[var(--nucleo)] px-3 py-2 text-xs"
            >
              Salvar
            </button>
          </div>
        </section>

        <form onSubmit={onCreate} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
          <div className="text-xs font-mono text-[var(--text-muted)]">NOVA MISSÃO</div>
          <textarea
            required
            minLength={3}
            rows={2}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm"
            placeholder="Objetivo"
          />
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button type="submit" className="rounded-lg bg-[var(--selo)] text-[var(--base)] px-4 py-2 text-sm font-medium">
            Criar missão
          </button>
        </form>

        <ul className="space-y-3">
          {missions.map((m) => (
            <li key={m.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
              <button type="button" className="w-full text-left flex justify-between gap-2" onClick={() => void openMission(m.id)}>
                <span className="text-sm font-medium">{m.objective}</span>
                <span className="text-[10px] font-mono text-[var(--nucleo)]">{m.status}</span>
              </button>

              {openId === m.id && (
                <div className="border-t border-[var(--border)] pt-3 space-y-3">
                  <div className="rounded-md border border-[var(--border)] bg-[var(--base)] p-3 space-y-2">
                    <div className="text-[10px] font-mono text-[var(--text-muted)]">RUNTIME</div>
                    {execution ? (
                      <>
                        <div className="text-xs font-mono text-[var(--nucleo)]">{execution.status}</div>
                        {execution.checkpoint && (
                          <pre className="text-[10px] overflow-x-auto text-[var(--text-secondary)]">
                            {JSON.stringify(execution.checkpoint)}
                          </pre>
                        )}
                        <div className="text-[10px] font-mono text-[var(--text-muted)]">
                          model: {modelConfigured ? modelInfo : "não configurado"}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <input
                            value={cpNote}
                            onChange={(e) => setCpNote(e.target.value)}
                            placeholder="nota"
                            className="flex-1 min-w-[8rem] rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
                          />
                          <button type="button" disabled={busy} className="text-[10px] font-mono border border-[var(--border)] px-2 py-1 rounded" onClick={() => void runtimePatch("checkpoint", { note: cpNote })}>
                            checkpoint
                          </button>
                          <button type="button" disabled={busy} className="text-[10px] font-mono border border-[var(--border)] px-2 py-1 rounded" onClick={() => void postExec("/tools", { name: "note", input: cpNote || "nota" })}>
                            tool note
                          </button>
                          <button type="button" disabled={busy} className="text-[10px] font-mono bg-[var(--selo)] text-[var(--base)] px-2 py-1 rounded" onClick={() => void postExec("/step")}>
                            stub step
                          </button>
                          <button type="button" disabled={busy || !modelConfigured} className="text-[10px] font-mono border border-[var(--selo)] text-[var(--nucleo)] px-2 py-1 rounded disabled:opacity-50" onClick={() => void postExec("/model-step")}>
                            model step
                          </button>
                          <button type="button" disabled={busy} className="text-[10px] font-mono border border-[var(--border)] px-2 py-1 rounded" onClick={() => void runtimePatch("pause")}>
                            pause
                          </button>
                          <button type="button" disabled={busy} className="text-[10px] font-mono border border-[var(--border)] px-2 py-1 rounded" onClick={() => void runtimePatch("interrupt")}>
                            interrupt
                          </button>
                          <button type="button" disabled={busy} className="text-[10px] font-mono border border-[var(--selo)] px-2 py-1 rounded" onClick={() => void runtimePatch("resume")}>
                            resume
                          </button>
                          <button type="button" disabled={busy} className="text-[10px] font-mono text-[var(--danger)] px-2" onClick={() => void runtimePatch("complete")}>
                            complete
                          </button>
                        </div>
                      </>
                    ) : (
                      <button type="button" onClick={() => void startRuntime()} className="text-xs rounded-lg bg-[var(--selo)] text-[var(--base)] px-3 py-1.5">
                        Iniciar execução
                      </button>
                    )}
                  </div>

                  {missionEvidence.length > 0 && (
                    <div className="rounded-md border border-[var(--border)] bg-[var(--base)] p-3 space-y-1 max-h-40 overflow-y-auto">
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">EVIDENCE ({missionEvidence.length})</div>
                      {missionEvidence
                        .slice()
                        .reverse()
                        .map((e) => (
                          <div key={e.id} className="text-xs border-l-2 border-[var(--selo)] pl-2">
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">
                              {e.source}/{e.type}
                            </span>
                            <div>{e.content}</div>
                          </div>
                        ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="Nova task"
                      className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-1.5 text-sm"
                    />
                    <button type="button" onClick={() => void addTask()} className="rounded-lg bg-[var(--selo)] text-[var(--base)] px-3 text-xs">
                      Add
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {tasks.map((t) => (
                      <li key={t.id} className="text-sm flex justify-between">
                        <span>{t.title}</span>
                        <span className="text-[10px] font-mono text-[var(--nucleo)]">{t.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>

        <p className="text-center text-xs text-[var(--text-muted)]">
          <Link href="/" className="hover:text-[var(--nucleo)]">
            ← Início
          </Link>
        </p>
      </main>
    </div>
  );
}
