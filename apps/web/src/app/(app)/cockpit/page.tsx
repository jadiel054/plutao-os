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

  // RESTORE_MARKER - full file continues via push_files next
  return null;
}
