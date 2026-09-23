"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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
import { runAutonomousMission } from "@/lib/cockpit/runAutonomousMission";
import { usePendingIntents } from "@/hooks/usePendingIntents";

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
  const [agentName, setAgentName] = useState("Plutão");
  const [agentIdentity, setAgentIdentity] = useState("");

  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      if (!me.ok) {
        router.replace("/login");
        return;
      }
      const meData = await me.json();
      const currentUserId = meData.user?.id ?? null;
      setUserId(currentUserId);
      setUserEmail(meData.user?.email ?? "");

      const res = await fetch("/api/missions", { cache: "no-store" });
      let remoteMissions: MissionRow[] = [];
      if (res.ok) {
        const data = await res.json();
        remoteMissions = data.missions ?? [];
      } else {
        setError("Falha ao carregar missões remotas");
      }
      setMissions(remoteMissions);
    } catch {
      setError("Erro de rede ao carregar cockpit");
      addToast("Erro de rede ao carregar o cockpit", "error");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
    void (async () => {
      try {
        const s = await fetch("/api/model/status", { cache: "no-store" });
        if (s.ok) {
          const d = await s.json();
          setModelConfigured(!!d.configured);
          if (d.configured) setModelInfo(`${d.provider}/${d.model}`);
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
  }, [load]);

  async function reloadMissionResource(
    id: string,
    resource: "mission" | "tasks" | "executions" | "evidence"
  ) {
    setActionBusy(`load_${resource}`);
    try {
      if (resource === "mission") {
        const res = await fetch(`/api/missions/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const d = await res.json();
        const mission = d.mission;
        setOpenMissionMeta({
          createdAt: mission?.createdAt ?? mission?.created_at,
          status: String(mission?.status ?? "CREATED"),
          objective: String(mission?.objective ?? ""),
        });
        setAllowedTransitions(Array.isArray(d.allowedTransitions) ? d.allowedTransitions : []);
        setMissions((prev) =>
          prev.map((row) =>
            row.id === id && mission?.status
              ? { ...row, status: String(mission.status) }
              : row
          )
        );
        setPanelErrors((prev) => ({ ...prev, mission: false }));
      } else if (resource === "tasks") {
        const res = await fetch(`/api/missions/${id}/tasks`, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const d = await res.json();
        setTasks((d.tasks ?? []).map((t: TaskRow) => ({ id: t.id, title: t.title, status: t.status })));
        setPanelErrors((prev) => ({ ...prev, tasks: false }));
      } else if (resource === "executions") {
        const res = await fetch(`/api/missions/${id}/executions`, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const d = await res.json();
        setExecution(d.recoverable ?? null);
        setPanelErrors((prev) => ({ ...prev, executions: false }));
      } else if (resource === "evidence") {
        const res = await fetch(`/api/missions/${id}/evidence`, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const d = await res.json();
        setMissionEvidence(d.evidence ?? []);
        setPanelErrors((prev) => ({ ...prev, evidence: false }));
      }
    } catch {
      setPanelErrors((prev) => ({ ...prev, [resource]: true }));
      addToast(`Falha ao recarregar dados da missão (${resource})`, "error");
    } finally {
      setActionBusy(null);
    }
  }

  async function openMission(id: string) {
    if (openId === id) {
      setOpenId(null);
      setTasks([]);
      setExecution(null);
      setMissionEvidence([]);
      setAllowedTransitions([]);
      setOpenMissionMeta(null);
      setDodResult(null);
      setPanelErrors({});
      return;
    }
    setOpenId(id);
    setActionBusy("load_mission");
    setPanelErrors({});

    const results = await Promise.allSettled([
      fetch(`/api/missions/${id}`, { cache: "no-store" }),
      fetch(`/api/missions/${id}/tasks`, { cache: "no-store" }),
      fetch(`/api/missions/${id}/executions`, { cache: "no-store" }),
      fetch(`/api/missions/${id}/evidence`, { cache: "no-store" }),
    ]);

    const newPanelErrors: { mission?: boolean; tasks?: boolean; executions?: boolean; evidence?: boolean } = {};

    // 0: mission
    const mRes = results[0];
    if (mRes.status === "fulfilled" && mRes.value.ok) {
      try {
        const d = await mRes.value.json();
        const mission = d.mission;
        setOpenMissionMeta({
          createdAt: mission?.createdAt ?? mission?.created_at,
          status: String(mission?.status ?? "CREATED"),
          objective: String(mission?.objective ?? ""),
        });
        setAllowedTransitions(Array.isArray(d.allowedTransitions) ? d.allowedTransitions : []);
        setMissions((prev) =>
          prev.map((row) =>
            row.id === id && mission?.status
              ? { ...row, status: String(mission.status) }
              : row
          )
        );
      } catch {
        newPanelErrors.mission = true;
      }
    } else {
      newPanelErrors.mission = true;
    }

    // 1: tasks
    const tRes = results[1];
    if (tRes.status === "fulfilled" && tRes.value.ok) {
      try {
        const d = await tRes.value.json();
        setTasks((d.tasks ?? []).map((t: TaskRow) => ({ id: t.id, title: t.title, status: t.status })));
      } catch {
        newPanelErrors.tasks = true;
      }
    } else {
      newPanelErrors.tasks = true;
    }

    // 2: executions
    const rRes = results[2];
    if (rRes.status === "fulfilled" && rRes.value.ok) {
      try {
        const d = await rRes.value.json();
        setExecution(d.recoverable ?? null);
      } catch {
        newPanelErrors.executions = true;
      }
    } else {
      newPanelErrors.executions = true;
    }

    // 3: evidence
    const eRes = results[3];
    if (eRes.status === "fulfilled" && eRes.value.ok) {
      try {
        const d = await eRes.value.json();
        setMissionEvidence(d.evidence ?? []);
      } catch {
        newPanelErrors.evidence = true;
      }
    } else {
      newPanelErrors.evidence = true;
    }

    if (Object.keys(newPanelErrors).length > 0) {
      setPanelErrors(newPanelErrors);
      addToast("Alguns painéis da missão falharam ao carregar", "warning");
    }

    setActionBusy(null);
  }

  async function verifyDoD() {
    if (!openId) return;
    setDodLoading(true);
    try {
      const res = await fetch(`/api/missions/${openId}/verify`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(d.error ?? "Falha ao verificar DoD", "error");
        return;
      }
      setDodResult({
        passed: !!d.passed,
        summary: String(d.summary ?? ""),
        checks: Array.isArray(d.checks) ? d.checks : [],
      });
      addToast(d.passed ? "DoD PASSED" : "DoD FAILED", d.passed ? "success" : "warning");
    } finally {
      setDodLoading(false);
    }
  }

  async function missionAction(action: "cancel" | "transition", toStatus?: string) {
    if (!openId) return;
    if (action === "cancel") {
      setConfirmModalState({
        isOpen: true,
        title: "Cancelar missão?",
        message: "A missão será marcada como CANCELLED. Essa ação é terminal.",
        onConfirm: () => void doMissionAction("cancel"),
      });
      return;
    }
    await doMissionAction(action, toStatus);
  }

  async function doMissionAction(action: "cancel" | "transition", toStatus?: string) {
    if (!openId) return;
    setConfirmModalState((prev) => ({ ...prev, isOpen: false }));
    setActionBusy(`mission_${action}`);
    try {
      const body =
        action === "cancel"
          ? { action: "cancel" }
          : { action: "transition", toStatus };
      const res = await fetch(`/api/missions/${openId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = d.error ?? "Falha ao atualizar missão";
        setError(errMsg);
        addToast(errMsg, "error");
        return;
      }
      const status = String(d.mission?.status ?? "");
      setAllowedTransitions(Array.isArray(d.allowedTransitions) ? d.allowedTransitions : []);
      setOpenMissionMeta((prev) =>
        prev ? { ...prev, status: status || prev.status } : prev
      );
      setMissions((prev) =>
        prev.map((row) => (row.id === openId ? { ...row, status: status || row.status } : row))
      );
      addToast(
        action === "cancel" ? "Missão cancelada" : `Missão → ${status}`,
        action === "cancel" ? "warning" : "success"
      );
    } catch {
      const errMsg = networkErrorMessage("atualizar a missão");
      setError(errMsg);
      addToast(errMsg, "error");
    } finally {
      setActionBusy(null);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!objective.trim()) return;
    setError(null);
    setActionBusy("create_mission");

    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

    if (isOffline) {
      try {
        await createOfflineMissionIntent({ objective: objective.trim() });
        setObjective("");
        addToast("Salvo localmente (Pendente de sincronização)", "info", "Offline");
      } catch {
        addToast("Erro ao salvar missão localmente", "error");
      } finally {
        setActionBusy(null);
      }
      return;
    }

    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective: objective.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const errMsg = d.error ?? "Falha ao criar missão";
        setError(errMsg);
        addToast(errMsg, "error");
        return;
      }
      setObjective("");
      addToast("Missão criada com sucesso!", "success");
      await load();
    } catch {
      // Falha de rede ao tentar criar online -> criar PendingIntent offline
      try {
        await createOfflineMissionIntent({ objective: objective.trim() });
        setObjective("");
        addToast(
          "Falha de rede. Missão salva localmente (Pendente de sincronização).",
          "warning"
        );
      } catch {
        const errMsg = networkErrorMessage("criar a missão");
        setError(errMsg);
        addToast(errMsg, "error");
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function saveAgent() {
    setBusy(true);
    setActionBusy("save_agent");
    setError(null);
    try {
      const res = await fetch("/api/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: agentName, identity: agentIdentity }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = d.error ?? d.message ?? "Falha ao salvar o perfil do agente";
        setError(errMsg);
        addToast(errMsg, "error");
        return;
      }
      addToast("Perfil do agente salvo com sucesso!", "success");
    } catch {
      const errMsg = networkErrorMessage("salvar o perfil do agente");
      setError(errMsg);
      addToast(errMsg, "error");
    } finally {
      setBusy(false);
      setActionBusy(null);
    }
  }

  async function startRuntime() {
    if (!openId) return;
    setBusy(true);
    setActionBusy("start_runtime");
    try {
      const res = await fetch(`/api/missions/${openId}/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentTaskId: tasks[0]?.id ?? null }),
      });
      const d = await res.json();
      if (res.ok) {
        setExecution(d.execution);
        addToast("Execução do runtime iniciada", "success");
      } else {
        const errMsg = d.error ?? "Falha ao iniciar runtime";
        setError(errMsg);
        addToast(errMsg, "error");
      }
    } catch {
      const errMsg = networkErrorMessage("iniciar o runtime");
      setError(errMsg);
      addToast(errMsg, "error");
    } finally {
      setBusy(false);
      setActionBusy(null);
    }
  }

  async function executeMission() {
    if (!openId) return;
    setError(null);
    setBusy(true);
    setActionBusy("execute_mission");
    try {
      await runAutonomousMission({
        missionId: openId,
        status: openMissionMeta?.status ?? "CREATED",
        execution: execution ? { id: execution.id, status: execution.status } : null,
        taskId: tasks[0]?.id ?? null,
        modelConfigured,
        onStatus: (s, allowed) => {
          setOpenMissionMeta((prev) =>
            prev ? { ...prev, status: s } : { status: s, objective: "", createdAt: undefined }
          );
          setAllowedTransitions(allowed);
          setMissions((prev) =>
            prev.map((row) => (row.id === openId ? { ...row, status: s } : row))
          );
        },
        onExecution: (e) => setExecution(e as ExecutionRow),
        onEvidence: (ev) => setMissionEvidence(ev as EvidenceItem[]),
        onError: (msg) => setError(msg),
        onToast: (msg, type) => addToast(msg, type),
      });
    } catch {
      const errMsg = networkErrorMessage("executar a missão");
      setError(errMsg);
      addToast(errMsg, "error");
    } finally {
      setBusy(false);
      setActionBusy(null);
    }
  }

  async function runtimePatch(action: string, extra?: Record<string, unknown>) {
    if (!execution) return;
    if (action === "complete") {
      setConfirmModalState({
        isOpen: true,
        title: "Finalizar Execução?",
        message: "Esta ação marcará o runtime da missão como concluído.",
        onConfirm: () => void doRuntimePatch(action, extra),
      });
      return;
    }
    await doRuntimePatch(action, extra);
  }

  async function doRuntimePatch(action: string, extra?: Record<string, unknown>) {
    if (!execution) return;
    setConfirmModalState((prev) => ({ ...prev, isOpen: false }));
    setBusy(true);
    setActionBusy(`patch_${action}`);
    try {
      const res = await fetch(`/api/executions/${execution.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await res.json();
      if (!res.ok) {
        const errMsg = d.error ?? "Falha";
        setError(errMsg);
        addToast(errMsg, "error");
        return;
      }
      if (action === "complete" || action === "fail") {
        setExecution(null);
        addToast(`Execução ${action === "complete" ? "concluída" : "falhou"}`, "info");
      } else {
        setExecution(d.execution);
        addToast(`Ação '${action}' executada com sucesso`, "success");
      }
    } catch {
      const errMsg = networkErrorMessage("atualizar a execução");
      setError(errMsg);
      addToast(errMsg, "error");
    } finally {
      setBusy(false);
      setActionBusy(null);
    }
  }

  async function postExec(path: string, body?: unknown) {
    if (!execution) return;
    setBusy(true);
    setActionBusy(`post_${path}`);
    setError(null);
    try {
      const res = await fetch(`/api/executions/${execution.id}${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await res.json();
      if (!res.ok) {
        const errMsg =
          d.error === "MODEL_NOT_CONFIGURED"
            ? "Configure MODEL_API_KEY no Vercel"
            : d.detail ?? d.error ?? "Falha na execução";
        setError(errMsg);
        addToast(errMsg, "error");
        return;
      }
      if (d.execution) setExecution(d.execution);
      addToast(`Execução de '${path}' finalizada`, "success");
      if (openId) {
        const eRes = await fetch(`/api/missions/${openId}/evidence`, { cache: "no-store" });
        if (eRes.ok) {
          const ed = await eRes.json();
          setMissionEvidence(ed.evidence ?? []);
        }
        const tRes = await fetch(`/api/missions/${openId}/tasks`, { cache: "no-store" });
        if (tRes.ok) {
          const td = await tRes.json();
          setTasks((td.tasks ?? []).map((t: TaskRow) => ({ id: t.id, title: t.title, status: t.status })));
        }
      }
    } catch {
      const errMsg = networkErrorMessage("executar essa ação");
      setError(errMsg);
      addToast(errMsg, "error");
    } finally {
      setBusy(false);
      setActionBusy(null);
    }
  }

  async function addTask() {
    if (!openId || taskTitle.trim().length < 2) return;
    setTaskError(null);
    setActionBusy("add_task");
    try {
      const res = await fetch(`/api/missions/${openId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = d.error ?? d.message ?? "Falha ao adicionar tarefa";
        setTaskError(errMsg);
        addToast(errMsg, "error");
        return;
      }
      addToast("Tarefa adicionada com sucesso", "success");
      setTaskTitle("");
      setTaskError(null);
      const tRes = await fetch(`/api/missions/${openId}/tasks`, { cache: "no-store" });
      if (tRes.ok) {
        const td = await tRes.json();
        setTasks((td.tasks ?? []).map((t: TaskRow) => ({ id: t.id, title: t.title, status: t.status })));
      }
    } catch {
      const errMsg = networkErrorMessage("adicionar a tarefa");
      setTaskError(errMsg);
      addToast(errMsg, "error");
    } finally {
      setActionBusy(null);
    }
  }

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
          <div className="text-xs font-mono font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
            <span>🤖</span> PERFIL E IDENTIDADE DO AGENTE
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)]"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Nome do Agente (ex: Plutão)"
            />
            <input
              className="flex-[2] rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)]"
              value={agentIdentity}
              onChange={(e) => setAgentIdentity(e.target.value)}
              placeholder="Identidade (ex: Assistente Autônomo)"
            />
            <button
              type="button"
              disabled={busy || actionBusy === "save_agent"}
              onClick={() => void saveAgent()}
              className="rounded-xl border border-[var(--selo)] bg-[var(--selo)]/10 text-[var(--nucleo)] hover:bg-[var(--selo)] hover:text-[var(--base)] px-4 py-2 text-xs font-medium transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {actionBusy === "save_agent" ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-[var(--nucleo)] border-t-transparent animate-spin" />
                  Salvar
                </>
              ) : (
                <>Salvar Perfil</>
              )}
            </button>
          </div>
        </section>

        <form onSubmit={onCreate} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3 shadow-xs">
          <div className="text-xs font-mono font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
            <span>🎯</span> CRIAR NOVA MISSÃO
          </div>
          <textarea
            required
            minLength={3}
            rows={2}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--selo)] transition-colors resize-none"
            placeholder="Descreva o objetivo principal da missão..."
          />
          {error && <p className="text-xs text-[var(--danger)] font-mono">{error}</p>}
          <button
            type="submit"
            disabled={actionBusy === "create_mission" || !objective.trim()}
            className="rounded-xl bg-[var(--selo)] text-[var(--base)] px-5 py-2 text-xs font-semibold hover:bg-[var(--nucleo)] transition-colors disabled:opacity-40 flex items-center gap-2 cursor-pointer"
          >
            {actionBusy === "create_mission" ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--base)]/30 border-t-[var(--base)] animate-spin" />
                Criando Missão…
              </>
            ) : (
              <>Criar Missão</>
            )}
          </button>
        </form>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono text-[var(--text-muted)]">MISSÕES CADASTRADAS</h2>
            {intents.filter((i) => i.status !== "APPLIED").length > 0 && (
              <button
                type="button"
                onClick={() => void reconcile()}
                className="text-[10px] font-mono text-[var(--selo)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                🔄 Reconciliar intents ({intents.filter((i) => i.status !== "APPLIED").length})
              </button>
            )}
          </div>

          {/* Lista de Pending Intents não aplicadas */}
          {intents
            .filter((i) => i.status !== "APPLIED")
            .map((intent) => {
              const payload = intent.payload as { objective?: string };
              const statusBadgeColor =
                intent.status === "SYNCING"
                  ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                  : intent.status === "FAILED_PERMANENT"
                  ? "bg-red-500/10 text-red-300 border-red-500/30"
                  : "bg-blue-500/10 text-blue-300 border-blue-500/30";

              return (
                <div
                  key={intent.intentId}
                  className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)]/50 p-4 space-y-2 opacity-90"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm">⏳</span>
                      <span className="text-xs font-semibold truncate text-[var(--text-primary)]">
                        {payload.objective || "Missão Pendente"}
                      </span>
                    </div>
                    <span
                      className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${statusBadgeColor}`}
                    >
                      {intent.status === "PENDING"
                        ? "Pendente de sincronização"
                        : intent.status === "SYNCING"
                        ? "Sincronizando…"
                        : intent.status === "FAILED_RETRYABLE"
                        ? "Falha temporária (tentará novamente)"
                        : "Falha permanente"}
                    </span>
                  </div>
                  {intent.lastError && (
                    <p className="text-[10px] text-red-400 font-mono truncate">
                      Erro: {intent.lastError}
                    </p>
                  )}
                </div>
              );
            })}

          {missions.length === 0 && intents.filter((i) => i.status !== "APPLIED").length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text-muted)]">
              Nenhuma missão cadastrada ainda. Crie uma missão acima para iniciar.
            </div>
          ) : (
            <ul className="space-y-3">
              {missions.map((m) => (
                <li key={m.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 shadow-xs">
                  <button
                    type="button"
                    className="w-full text-left flex justify-between items-center gap-3 cursor-pointer group"
                    onClick={() => void openMission(m.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base group-hover:scale-110 transition-transform shrink-0">
                        {openId === m.id ? "📂" : "📁"}
                      </span>
                      <span className="text-sm font-semibold group-hover:text-[var(--selo)] transition-colors truncate">
                        {m.objective}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-[var(--base)] border border-[var(--border)] text-[var(--nucleo)] shrink-0">
                      {m.status}
                    </span>
                  </button>

                  {openId === m.id && (
                    <div className="border-t border-[var(--border)] pt-4 space-y-4 animate-in fade-in duration-150">
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[var(--text-muted)]">
                          <span>CICLO DE VIDA DA MISSÃO</span>
                          <span className="text-[var(--nucleo)]">{openMissionMeta?.status ?? m.status}</span>
                        </div>
                        {panelErrors.mission ? (
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 font-mono">
                            <span>Falha ao carregar ciclo de vida.</span>
                            <button
                              type="button"
                              onClick={() => void reloadMissionResource(m.id, "mission")}
                              className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white transition-colors cursor-pointer"
                            >
                              Tentar novamente
                            </button>
                          </div>
                        ) : null}
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            disabled={
                              !!actionBusy ||
                              busy ||
                              ["COMPLETED", "CANCELLED", "FAILED"].includes(
                                (openMissionMeta?.status ?? m.status).toUpperCase()
                              )
                            }
                            onClick={() => void executeMission()}
                            className="w-full text-xs font-semibold rounded-xl bg-[var(--nucleo)] text-[var(--base)] hover:opacity-90 transition-all py-2.5 px-4 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                          >
                            {actionBusy === "execute_mission" ? (
                              <>
                                <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--base)]/30 border-t-[var(--base)] animate-spin" />
                                Executando…
                              </>
                            ) : (
                              <>▶ Executar missão</>
                            )}
                          </button>
                          <p className="text-[10px] text-[var(--text-muted)] font-mono text-center">
                            Autonomia V1: ciclo → runtime → até 5 model steps
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {allowedTransitions
                            .filter((s) => s !== "CANCELLED")
                            .map((s) => (
                              <button
                                key={s}
                                type="button"
                                disabled={!!actionBusy}
                                onClick={() => void missionAction("transition", s)}
                                className="text-[10px] font-mono rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--selo)] hover:text-[var(--selo)] px-3 py-1.5 disabled:opacity-50 cursor-pointer"
                              >
                                → {s}
                              </button>
                            ))}
                          <button
                            type="button"
                            disabled={
                              !!actionBusy ||
                              ["COMPLETED", "CANCELLED", "FAILED"].includes(
                                (openMissionMeta?.status ?? m.status).toUpperCase()
                              )
                            }
                            onClick={() => void missionAction("cancel")}
                            className="text-[10px] font-mono rounded-xl border border-red-500/40 text-red-300 hover:bg-red-500/10 px-3 py-1.5 disabled:opacity-40 cursor-pointer"
                          >
                            Cancelar missão
                          </button>
                        </div>
                        {allowedTransitions.length === 0 ? (
                          <p className="text-[11px] text-[var(--text-muted)]">
                            Missão em estado terminal — sem transições disponíveis.
                          </p>
                        ) : null}
                      </div>

                      <div className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-4 space-y-3">
                        <div className="text-[11px] font-mono text-[var(--text-muted)] font-semibold">
                          TIMELINE DA MISSÃO
                        </div>
                        {actionBusy === "load_mission" ? (
                          <p className="text-xs text-[var(--text-muted)] font-mono">Montando timeline…</p>
                        ) : (
                          <MissionTimeline
                            events={buildMissionTimeline({
                              missionId: m.id,
                              objective: openMissionMeta?.objective || m.objective,
                              status: openMissionMeta?.status || m.status,
                              createdAt: openMissionMeta?.createdAt || m.createdAt,
                              tasks,
                              execution,
                              evidence: missionEvidence,
                            })}
                          />
                        )}
                      </div>

                      <div className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-4 space-y-3">
                        <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
                          <span>RUNTIME CONTROLLER</span>
                          <span>Model: {modelConfigured ? modelInfo : "Offline / Local"}</span>
                        </div>

                        {panelErrors.executions ? (
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 font-mono">
                            <span>Falha ao carregar runtime.</span>
                            <button
                              type="button"
                              onClick={() => void reloadMissionResource(m.id, "executions")}
                              className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white transition-colors cursor-pointer"
                            >
                              Tentar novamente
                            </button>
                          </div>
                        ) : execution ? (
                          <>
                            <div className="flex items-center gap-2 text-xs font-mono">
                              <span className="text-[var(--text-muted)]">Status do Runtime:</span>
                              <span className="text-[var(--nucleo)] font-bold">{execution.status}</span>
                            </div>

                            {execution.checkpoint && (
                              <div className="p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[10px] font-mono overflow-x-auto text-[var(--text-secondary)]">
                                {JSON.stringify(execution.checkpoint, null, 2)}
                              </div>
                            )}

                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <input
                                  value={cpNote}
                                  onChange={(e) => setCpNote(e.target.value)}
                                  placeholder="Nota de checkpoint..."
                                  className="flex-1 min-w-[8rem] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                                />
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runtimePatch("checkpoint", { note: cpNote })}
                                  className="text-[10px] font-mono border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--base)] px-3 py-1.5 rounded-xl disabled:opacity-50 cursor-pointer"
                                >
                                  Checkpoint
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void postExec("/tools", { name: "note", input: cpNote || "nota" })}
                                  className="text-[10px] font-mono border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--base)] px-3 py-1.5 rounded-xl disabled:opacity-50 cursor-pointer"
                                >
                                  Tool Note
                                </button>
                              </div>

                              <div className="flex flex-wrap gap-2 pt-1">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void postExec("/step")}
                                  className="text-[10px] font-mono bg-[var(--selo)] text-[var(--base)] font-bold px-3 py-1.5 rounded-xl hover:bg-[var(--nucleo)] disabled:opacity-50 cursor-pointer"
                                >
                                  Stub Step
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void postExec("/model-step")}
                                  className="text-[10px] font-mono bg-[var(--selo)] text-[var(--base)] font-bold px-3 py-1.5 rounded-xl hover:bg-[var(--nucleo)] disabled:opacity-50 cursor-pointer"
                                >
                                  Model Step
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void postExec("/run")}
                                  className="text-[10px] font-mono bg-[var(--nucleo)] text-[var(--base)] font-bold px-3 py-1.5 rounded-xl hover:opacity-90 disabled:opacity-50 cursor-pointer"
                                >
                                  Run Loop
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runtimePatch("pause")}
                                  className="text-[10px] font-mono border border-[var(--border)] px-3 py-1.5 rounded-xl disabled:opacity-50 cursor-pointer"
                                >
                                  Pause
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runtimePatch("resume")}
                                  className="text-[10px] font-mono border border-[var(--border)] px-3 py-1.5 rounded-xl disabled:opacity-50 cursor-pointer"
                                >
                                  Resume
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runtimePatch("complete")}
                                  className="text-[10px] font-mono border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-xl disabled:opacity-50 cursor-pointer"
                                >
                                  Concluir Execução
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-[var(--text-muted)]">Nenhum runtime ativo</span>
                            <button
                              type="button"
                              disabled={actionBusy === "start_runtime"}
                              onClick={() => void startRuntime()}
                              className="text-xs font-semibold rounded-xl bg-[var(--selo)] text-[var(--base)] px-4 py-1.5 hover:bg-[var(--nucleo)] transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                            >
                              {actionBusy === "start_runtime" ? (
                                <>
                                  <span className="w-3 h-3 rounded-full border-2 border-[var(--base)]/30 border-t-[var(--base)] animate-spin" />
                                  Iniciando…
                                </>
                              ) : (
                                <>🚀 Iniciar Execução</>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] font-mono text-[var(--text-muted)] font-semibold">
                          EVIDÊNCIAS DA MISSÃO
                        </div>
                        {panelErrors.evidence ? (
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 font-mono">
                            <span>Falha ao carregar evidências.</span>
                            <button
                              type="button"
                              onClick={() => void reloadMissionResource(m.id, "evidence")}
                              className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white transition-colors cursor-pointer"
                            >
                              Tentar novamente
                            </button>
                          </div>
                        ) : (
                          <MissionEvidencePanel
                            items={missionEvidence}
                            loading={actionBusy === "load_mission"}
                          />
                        )}
                      </div>

                      <MissionDoDPanel
                        loading={dodLoading}
                        passed={dodResult?.passed ?? null}
                        summary={dodResult?.summary}
                        checks={dodResult?.checks}
                        busy={!!actionBusy || busy}
                        onVerify={() => void verifyDoD()}
                      />

                      <div className="space-y-2">
                        <div className="text-[11px] font-mono text-[var(--text-muted)] font-semibold">TAREFAS DA MISSÃO</div>
                        {panelErrors.tasks ? (
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 font-mono">
                            <span>Falha ao carregar tarefas.</span>
                            <button
                              type="button"
                              onClick={() => void reloadMissionResource(m.id, "tasks")}
                              className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white transition-colors cursor-pointer"
                            >
                              Tentar novamente
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex gap-2">
                              <input
                                value={taskTitle}
                                onChange={(e) => {
                                  setTaskTitle(e.target.value);
                                  if (taskError) setTaskError(null);
                                }}
                                placeholder="Adicionar nova sub-tarefa..."
                                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                              />
                              <button
                                type="button"
                                disabled={actionBusy === "add_task" || !taskTitle.trim()}
                                onClick={() => void addTask()}
                                className="rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold px-4 py-1.5 hover:bg-[var(--nucleo)] disabled:opacity-40 cursor-pointer"
                              >
                                + Add
                              </button>
                            </div>
                            {taskError && (
                              <p className="text-xs text-[var(--danger)] font-mono">{taskError}</p>
                            )}
                            {tasks.length === 0 ? (
                              <p className="text-xs text-[var(--text-muted)] italic">Nenhuma sub-tarefa criada ainda.</p>
                            ) : (
                              <ul className="space-y-1.5 pt-1">
                                {tasks.map((t) => (
                                  <li key={t.id} className="text-xs flex items-center justify-between p-2 rounded-lg border border-[var(--border)] bg-[var(--base)]">
                                    <span className="text-[var(--text-primary)]">{t.title}</span>
                                    <span className="text-[10px] font-mono text-[var(--nucleo)] px-2 py-0.5 rounded bg-[var(--surface)]">
                                      {t.status}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <MobileNav />

      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        onConfirm={confirmModalState.onConfirm}
        onCancel={() => setConfirmModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
