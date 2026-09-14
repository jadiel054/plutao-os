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
  createdAt?: string;
  taskId?: string | null;
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
  const [allowedTransitions, setAllowedTransitions] = useState<string[]>([]);
  const [openMissionMeta, setOpenMissionMeta] = useState<{
    createdAt?: string;
    status: string;
    objective: string;
  } | null>(null);
  const [cpNote, setCpNote] = useState("");
  const [modelConfigured, setModelConfigured] = useState(false);
  const [modelInfo, setModelInfo] = useState("");
  const [agentName, setAgentName] = useState("Plutão");
  const [agentIdentity, setAgentIdentity] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
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
      setUserEmail(meData.user?.email ?? "");
      const res = await fetch("/api/missions", { cache: "no-store" });
      if (!res.ok) {
        setError("Falha ao carregar missões");
        addToast("Falha ao carregar lista de missões", "error");
        return;
      }
      const data = await res.json();
      setMissions(data.missions ?? []);
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

  async function openMission(id: string) {
    if (openId === id) {
      setOpenId(null);
      setTasks([]);
      setExecution(null);
      setMissionEvidence([]);
      setAllowedTransitions([]);
      setOpenMissionMeta(null);
      return;
    }
    setOpenId(id);
    setActionBusy("load_mission");
    try {
      const [mRes, tRes, rRes, eRes] = await Promise.all([
        fetch(`/api/missions/${id}`, { cache: "no-store" }),
        fetch(`/api/missions/${id}/tasks`, { cache: "no-store" }),
        fetch(`/api/missions/${id}/executions`, { cache: "no-store" }),
        fetch(`/api/missions/${id}/evidence`, { cache: "no-store" }),
      ]);
      if (mRes.ok) {
        const d = await mRes.json();
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
      }
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
    } finally {
      setActionBusy(null);
    }
  }

  // CONTINUED IN NEXT COMMIT - PLACEHOLDER_RESTORE_PART1
  return (
    <div className="min-h-dvh flex items-center justify-center p-8 bg-[var(--base)] text-[var(--text-primary)]">
      <p className="text-sm text-[var(--text-muted)]">Restaurando cockpit (parte 1)…</p>
    </div>
  );
}
