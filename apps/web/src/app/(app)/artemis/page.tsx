"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";

type Task = { id: string; executor: string; prompt: string; deviceSerial: string; status: string; githubRunId: string | null; summary: string | null; error: string | null; createdAt: string };
const labels: Record<string, string> = { artemis: "ARTEMIS", maestro: "Maestro", appium: "Appium", playwright: "Playwright", androidworld: "AndroidWorld" };

export default function ArtemisPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const me = await fetch("/api/auth/me", { cache: "no-store" });
    if (!me.ok) { router.replace("/login"); return; }
    const res = await fetch(`/api/automation/tasks${filter === "all" ? "" : `?executor=${filter}`}`, { cache: "no-store" });
    if (!res.ok) { setError("Não foi possível carregar os executores."); return; }
    setTasks((await res.json()).tasks ?? []);
    setLoading(false);
  }, [filter, router]);

  useEffect(() => { void load(); const timer = setInterval(() => void load(), 10_000); return () => clearInterval(timer); }, [load]);
  const cancel = async (id: string) => { await fetch(`/api/artemis/tasks/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Cancelada no painel" }) }); await load(); };

  return <div className="min-h-dvh bg-[var(--base)] text-[var(--text-primary)] pb-20 sm:pb-4"><Header /><main className="mx-auto max-w-5xl px-4 py-8">
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6"><div><p className="text-xs uppercase tracking-[0.2em] text-[var(--selo)]">Executores</p><h1 className="text-2xl font-semibold mt-1">ARTEMIS e automação</h1><p className="text-sm text-[var(--text-muted)] mt-2 max-w-2xl">Acompanhe execuções assíncronas Android, web e benchmarks. O resultado final chega por evidence após o poller.</p></div><select aria-label="Filtrar executor" value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"><option value="all">Todos</option>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
    {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div> : null}
    {loading ? <p className="text-sm text-[var(--text-muted)]">Carregando…</p> : tasks.length === 0 ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">Nenhuma execução encontrada.</div> : <div className="grid gap-3">{tasks.map((task) => <article key={task.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="font-medium">{labels[task.executor] ?? task.executor}</span><span className="rounded-full bg-[var(--base)] px-2 py-0.5 text-[11px] uppercase tracking-wide text-[var(--selo)]">{task.status}</span></div>{["pending", "running"].includes(task.status) ? <button type="button" onClick={() => void cancel(task.id)} className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10">Cancelar</button> : null}</div><p className="mt-3 text-sm text-[var(--text-secondary)] line-clamp-2">{task.prompt}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]"><span>Device: {task.deviceSerial}</span><span>{new Date(task.createdAt).toLocaleString()}</span>{task.githubRunId ? <span>Run: {task.githubRunId}</span> : null}</div>{task.error ? <p className="mt-2 text-xs text-red-300">{task.error}</p> : null}</article>)}</div>}
  </main><MobileNav /></div>;
}
