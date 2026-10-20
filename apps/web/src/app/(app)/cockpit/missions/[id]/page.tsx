"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { ToastContainer, type ToastMessage, type ToastType } from "@/components/Toast";
import { MissionTimeline, buildMissionTimeline } from "@/components/MissionTimeline";
import { MissionEvidencePanel } from "@/components/MissionEvidencePanel";
import { MissionDoDPanel } from "@/components/MissionDoDPanel";

type Props = { params: Promise<{ id: string }> };
type TaskData = { id: string; title: string; description?: string | null; status: string; parentTaskId?: string | null; startedAt?: string | null; completedAt?: string | null; updatedAt?: string | null };
type ExecutionData = { id: string; status: string; currentTaskId?: string | null; checkpoint?: Record<string, unknown> | null; checkpointAt?: string | null; error?: string | null; startedAt?: string | null; updatedAt?: string | null; completedAt?: string | null };
type JobData = { id: string; executionId: string; status: string; attempts: number; maxAttempts: number; availableAt?: string | null; lockedAt?: string | null; lastError?: string | null; updatedAt?: string | null; completedAt?: string | null };
type EvidenceData = { id: string; type: string; content: string; source: string; taskId?: string | null; missionId?: string; executionId?: string; status?: string; metadata?: Record<string, unknown>; createdAt?: string };
type MissionData = { id: string; objective: string; status: string; currentState?: string; definitionOfDone?: string | null; plan?: unknown; missionGraph?: { nodes?: Array<{ id?: string; title?: string; label?: string }> } | null; graphVersion?: number | null; completedSteps?: unknown; pendingSteps?: unknown; createdAt?: string; updatedAt?: string };
type OverviewData = { mission: MissionData; tasks: TaskData[]; executions: ExecutionData[]; runtimeJobs: JobData[]; evidence: EvidenceData[]; dod?: { passed?: boolean; summary?: string; checks?: Array<{ id: string; label: string; passed: boolean; detail?: string }> }; telemetry: unknown[]; lastUpdated?: string };

function tone(status: string) {
  const value = status.toUpperCase();
  if (["COMPLETED", "SUCCEEDED", "PASSED"].includes(value)) return "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
  if (["FAILED", "CANCELLED", "EXPIRED"].includes(value)) return "text-red-300 border-red-500/40 bg-red-500/10";
  if (["RUNNING", "EXECUTING", "PENDING", "WAITING_APPROVAL"].includes(value)) return "text-amber-300 border-amber-500/40 bg-amber-500/10";
  return "text-[var(--text-secondary)] border-[var(--border)] bg-[var(--surface)]";
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function MissionDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dodLoading, setDodLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    setToasts((current) => [...current, { id: crypto.randomUUID(), message, type }]);
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/missions/${id}/overview`, { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (response.status === 404) {
        setError("Missão não encontrada ou sem acesso.");
        return;
      }
      if (!response.ok) throw new Error("Falha ao carregar visão operacional");
      setOverview((await response.json()) as OverviewData);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro de rede ao carregar missão");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" }).then(async (res) => {
      if (res.ok) setEmail((await res.json()).user?.email ?? "");
    });
    void load();
  }, [load]);

  const mission = overview?.mission;
  const activeStatus = String(mission?.status ?? "");
  useEffect(() => {
    if (!overview || ["COMPLETED", "FAILED", "CANCELLED", "INCONCLUSIVE"].includes(activeStatus.toUpperCase())) return;
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [activeStatus, load, overview]);

  const timeline = useMemo(() => {
    if (!mission || !overview) return [];
    const execution = overview.executions?.[0] ?? null;
    return buildMissionTimeline({
      missionId: mission.id,
      objective: mission.objective,
      status: mission.status,
      createdAt: mission.createdAt,
      tasks: (overview.tasks ?? []).map((task) => ({ id: task.id, title: task.title, status: task.status })),
      execution: execution
        ? { id: execution.id, status: execution.status, checkpoint: execution.checkpoint ?? null, checkpointAt: execution.checkpointAt ?? null }
        : null,
      evidence: overview.evidence ?? [],
    });
  }, [mission, overview]);

  async function action(name: string, url: string, init?: RequestInit) {
    setBusy(name);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, ...init });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? data.error ?? "Ação não concluída");
      addToast(name === "run" ? "Missão enfileirada" : "Ação concluída", "success");
      await load(true);
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : "Falha na ação", "error");
    } finally {
      setBusy(null);
    }
  }

  async function verifyDod() {
    setDodLoading(true);
    try {
      const response = await fetch(`/api/missions/${id}/verify`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Falha ao verificar DoD");
      setOverview((current) => current ? { ...current, dod: result } : current);
      addToast(result.passed ? "DoD aprovado" : "DoD ainda não aprovado", result.passed ? "success" : "info");
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : "Falha na verificação", "error");
    } finally {
      setDodLoading(false);
    }
  }

  if (loading) return <div className="min-h-dvh flex items-center justify-center text-sm text-[var(--text-muted)] font-mono">Carregando missão…</div>;
  if (error || !overview || !mission) return <div className="min-h-dvh flex flex-col items-center justify-center gap-4 text-sm text-red-300"><p>{error ?? "Missão indisponível"}</p><button className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs" onClick={() => router.push("/cockpit")}>Voltar ao Cockpit</button></div>;

  const execution = overview.executions?.[0];
  const job = overview.runtimeJobs?.[0];
  const graph = mission.missionGraph;
  const graphNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];

  return (
    <div className="min-h-dvh bg-[var(--base)] text-[var(--text-primary)] pb-20 sm:pb-8">
      <Header userEmail={email} onNotify={(message, type) => addToast(message, type)} />
      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <button className="mb-3 text-xs text-[var(--selo)] hover:underline" onClick={() => router.push("/cockpit")}>← Cockpit</button>
            <h1 className="break-words text-xl font-bold">{mission.objective}</h1>
            <p className="mt-1 text-[10px] font-mono text-[var(--text-muted)]">Atualizado {formatDate(overview.lastUpdated)} · ID {String(mission.id).slice(0, 8)}…</p>
          </div>
          <span className={`self-start rounded-full border px-3 py-1.5 text-xs font-mono ${tone(activeStatus)}`}>{activeStatus}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Execução", execution?.status ?? "—"], ["Job", job?.status ?? "—"], ["Tasks", String((overview.tasks ?? []).length)], ["Evidence", String((overview.evidence ?? []).length)]].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</p><p className={`mt-1 truncate text-sm font-semibold ${tone(String(value)).split(" ")[0]}`}>{value}</p></div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy || ["COMPLETED", "FAILED", "CANCELLED"].includes(activeStatus)} onClick={() => void action("run", `/api/missions/${id}/autonomous-run`, { body: "{}" })} className="rounded-xl bg-[var(--selo)] px-4 py-2 text-xs font-semibold text-[var(--base)] disabled:opacity-40">{busy === "run" ? "Enfileirando…" : "▶ Executar / retomar"}</button>
          <button disabled={!!busy || ["COMPLETED", "FAILED", "CANCELLED"].includes(activeStatus)} onClick={() => void action("cancel", `/api/missions/${id}/stop`, { body: "{}" })} className="rounded-xl border border-red-500/40 px-4 py-2 text-xs text-red-300 disabled:opacity-40">Cancelar</button>
          <button onClick={() => void load()} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs">Atualizar</button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-4 text-sm font-semibold">Timeline causal</h2>
            <MissionTimeline events={timeline} />
          </section>
          <div className="space-y-5">
            <MissionDoDPanel passed={overview.dod?.passed ?? null} summary={overview.dod?.summary} checks={overview.dod?.checks ?? []} onVerify={() => void verifyDod()} busy={dodLoading} />
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h2 className="mb-3 text-[11px] font-mono font-semibold text-[var(--text-muted)]">GRAFO DA MISSÃO</h2>
          {graphNodes.length === 0 ? <p className="text-xs text-[var(--text-muted)]">Grafo ainda não persistido.</p> : <ol className="space-y-1.5">{graphNodes.map((node, index) => <li key={node.id ?? index} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs"><span className="font-mono text-[var(--text-muted)]">{index + 1}</span><span>{node.title ?? node.label ?? node.id ?? "Nó"}</span></li>)}</ol>}
            </section>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <MissionEvidencePanel items={overview.evidence ?? []} />
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-3 text-[11px] font-mono font-semibold text-[var(--text-muted)]">EXECUÇÃO E TELEMETRIA</h2>
            <div className="space-y-2 text-xs">
              <p><span className="text-[var(--text-muted)]">Execution:</span> {execution?.id ?? "—"}</p>
              <p><span className="text-[var(--text-muted)]">Job:</span> {job?.id ?? "—"} · tentativa {job?.attempts ?? "—"}/{job?.maxAttempts ?? "—"}</p>
              <p><span className="text-[var(--text-muted)]">Última execução:</span> {formatDate(execution?.updatedAt)}</p>
              <p><span className="text-[var(--text-muted)]">Eventos runtime:</span> {overview.telemetry?.length ?? 0}</p>
              {execution?.error || job?.lastError ? <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-[10px] text-red-200">{execution?.error ?? job?.lastError}</pre> : null}
            </div>
          </section>
        </div>
      </main>
      <MobileNav />
      <ToastContainer toasts={toasts} onDismiss={(toastId) => setToasts((current) => current.filter((toast) => toast.id !== toastId))} />
    </div>
  );
}
