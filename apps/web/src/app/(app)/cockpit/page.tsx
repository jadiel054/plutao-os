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

type TaskRow = {
  id: string;
  missionId: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type EvidenceItem = {
  id: string;
  type: string;
  content: string;
  source: string;
  taskId: string | null;
  createdAt: string;
};

type User = { id: string; email: string; name: string | null };

const MISSION_NEXT: Record<string, string[]> = {
  CREATED: ["UNDERSTANDING"],
  UNDERSTANDING: ["PLANNING", "BLOCKED", "FAILED"],
  PLANNING: ["EXECUTING", "BLOCKED", "FAILED"],
  EXECUTING: ["VERIFYING", "CORRECTING", "BLOCKED", "FAILED"],
  VERIFYING: ["COMPLETED", "CORRECTING", "BLOCKED", "FAILED"],
  CORRECTING: ["EXECUTING", "VERIFYING", "BLOCKED", "FAILED"],
  BLOCKED: ["UNDERSTANDING", "PLANNING", "EXECUTING", "FAILED"],
};

const TASK_NEXT: Record<string, string[]> = {
  CREATED: ["READY"],
  READY: ["RUNNING", "BLOCKED"],
  RUNNING: ["WAITING", "BLOCKED", "COMPLETED", "FAILED"],
  WAITING: ["RUNNING", "BLOCKED", "FAILED"],
  BLOCKED: ["READY", "RUNNING", "FAILED"],
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

  const [openId, setOpenId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [evidenceByTask, setEvidenceByTask] = useState<Record<string, EvidenceItem[]>>({});
  const [evDraft, setEvDraft] = useState<Record<string, string>>({});

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

  async function loadTasks(missionId: string) {
    const res = await fetch(`/api/missions/${missionId}/tasks`);
    if (!res.ok) {
      setError("Falha ao carregar tasks");
      return;
    }
    const data = await res.json();
    const list: TaskRow[] = data.tasks ?? [];
    setTasks(list);
    const map: Record<string, EvidenceItem[]> = {};
    await Promise.all(
      list.map(async (t) => {
        const er = await fetch(`/api/tasks/${t.id}/evidence`);
        if (er.ok) {
          const ed = await er.json();
          map[t.id] = ed.evidence ?? [];
        }
      })
    );
    setEvidenceByTask(map);
  }

  async function openMission(id: string) {
    if (openId === id) {
      setOpenId(null);
      setTasks([]);
      return;
    }
    setOpenId(id);
    setTaskTitle("");
    await loadTasks(id);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective, definitionOfDone: definitionOfDone || null }),
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

  async function onMissionTransition(id: string, toStatus: string) {
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

  async function onMissionCancel(id: string) {
    if (!confirm("Cancelar esta missão?")) return;
    const res = await fetch(`/api/missions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (res.ok) await load();
  }

  async function onCreateTask(missionId: string) {
    const title = taskTitle.trim();
    if (title.length < 2) return;
    const res = await fetch(`/api/missions/${missionId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Falha ao criar task");
      return;
    }
    setTaskTitle("");
    await loadTasks(missionId);
  }

  async function onTaskTransition(taskId: string, toStatus: string) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "transition", toStatus }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Transição de task recusada");
      return;
    }
    if (openId) await loadTasks(openId);
  }

  async function onTaskCancel(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (res.ok && openId) await loadTasks(openId);
  }

  async function onAddEvidence(taskId: string) {
    const content = (evDraft[taskId] ?? "").trim();
    if (!content) return;
    const res = await fetch(`/api/tasks/${taskId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content, source: "user" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Falha ao registrar evidência");
      return;
    }
    setEvDraft((d) => ({ ...d, [taskId]: "" }));
    if (openId) await loadTasks(openId);
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
          <h1 className="text-2xl font-semibold tracking-tight">Missões · Tasks · Evidence</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Phase 2 — abra uma missão para gerenciar tasks e evidências mínimas.
          </p>
        </section>

        <form onSubmit={onCreate} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <div className="text-xs font-mono text-[var(--text-muted)]">NOVA MISSÃO</div>
          <textarea required minLength={3} rows={2} value={objective} onChange={(e) => setObjective(e.target.value)}
            placeholder="Objetivo"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm outline-none focus:border-[var(--selo)]" />
          <input value={definitionOfDone} onChange={(e) => setDefinitionOfDone(e.target.value)}
            placeholder="Definition of Done (opcional)"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm outline-none focus:border-[var(--selo)]" />
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button type="submit" disabled={creating}
            className="rounded-lg bg-[var(--selo)] text-[var(--base)] font-medium px-4 py-2 text-sm hover:bg-[var(--nucleo)] disabled:opacity-60">
            {creating ? "Criando…" : "Criar missão"}
          </button>
        </form>

        <section className="space-y-3">
          {missions.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] border border-dashed border-[var(--border)] rounded-lg p-6 text-center">Nenhuma missão.</p>
          ) : (
            <ul className="space-y-3">
              {missions.map((m) => {
                const open = openId === m.id;
                const advances = MISSION_NEXT[m.status] ?? [];
                const terminal = ["CANCELLED", "COMPLETED", "FAILED"].includes(m.status);
                return (
                  <li key={m.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
                    <button type="button" className="w-full text-left flex items-start justify-between gap-3" onClick={() => void openMission(m.id)}>
                      <p className="text-sm font-medium leading-snug">{m.objective}</p>
                      <span className="shrink-0 text-[10px] font-mono uppercase rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--nucleo)]">{m.status}</span>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      {advances.map((s) => (
                        <button key={s} type="button" onClick={() => void onMissionTransition(m.id, s)}
                          className="text-[10px] font-mono uppercase rounded border border-[var(--border)] px-2 py-1 text-[var(--text-secondary)] hover:border-[var(--selo)]">→ {s}</button>
                      ))}
                      {!terminal && (
                        <button type="button" onClick={() => void onMissionCancel(m.id)} className="text-[10px] font-mono uppercase text-[var(--danger)] hover:underline">Cancelar</button>
                      )}
                      <button type="button" onClick={() => void openMission(m.id)} className="text-[10px] font-mono text-[var(--nucleo)] hover:underline ml-auto">
                        {open ? "Fechar tasks" : "Tasks"}
                      </button>
                    </div>

                    {open && (
                      <div className="border-t border-[var(--border)] pt-3 space-y-3">
                        <div className="flex gap-2">
                          <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Nova task…"
                            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-1.5 text-sm outline-none focus:border-[var(--selo)]" />
                          <button type="button" onClick={() => void onCreateTask(m.id)}
                            className="rounded-lg bg-[var(--selo)] text-[var(--base)] px-3 py-1.5 text-xs font-medium">Add</button>
                        </div>
                        {tasks.length === 0 ? (
                          <p className="text-xs text-[var(--text-muted)]">Nenhuma task nesta missão.</p>
                        ) : (
                          <ul className="space-y-2">
                            {tasks.map((t) => {
                              const tNext = TASK_NEXT[t.status] ?? [];
                              const tTerm = ["COMPLETED", "FAILED", "CANCELLED"].includes(t.status);
                              const evs = evidenceByTask[t.id] ?? [];
                              return (
                                <li key={t.id} className="rounded-md border border-[var(--border)] bg-[var(--base)] p-3 space-y-2">
                                  <div className="flex justify-between gap-2">
                                    <span className="text-sm">{t.title}</span>
                                    <span className="text-[10px] font-mono text-[var(--nucleo)]">{t.status}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {tNext.map((s) => (
                                      <button key={s} type="button" onClick={() => void onTaskTransition(t.id, s)}
                                        className="text-[9px] font-mono uppercase rounded border border-[var(--border)] px-1.5 py-0.5 text-[var(--text-muted)] hover:text-[var(--nucleo)]">→ {s}</button>
                                    ))}
                                    {!tTerm && (
                                      <button type="button" onClick={() => void onTaskCancel(t.id)} className="text-[9px] font-mono text-[var(--danger)]">Cancel</button>
                                    )}
                                  </div>
                                  <div className="space-y-1">
                                    <div className="text-[10px] font-mono text-[var(--text-muted)]">EVIDENCE</div>
                                    {evs.map((e) => (
                                      <p key={e.id} className="text-xs text-[var(--text-secondary)] border-l-2 border-[var(--selo)] pl-2">{e.content}</p>
                                    ))}
                                    <div className="flex gap-1">
                                      <input value={evDraft[t.id] ?? ""} onChange={(e) => setEvDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                                        placeholder="Nota de evidência…"
                                        className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs outline-none focus:border-[var(--selo)]" />
                                      <button type="button" onClick={() => void onAddEvidence(t.id)} className="text-[10px] font-mono text-[var(--nucleo)] px-2">+ev</button>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
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
