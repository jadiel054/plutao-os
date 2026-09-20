"use client";

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState, KeyboardEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { ChatHistoryDrawer } from "@/components/ChatHistoryDrawer";
import { MobileNav } from "@/components/MobileNav";
import { ToastContainer, ToastMessage, ToastType } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { LongInputModal, type ArtifactRef } from "@/components/LongInputModal";
import { MissionWorkspaceBar } from "@/components/MissionWorkspaceBar";
import { ChatAttachMenu } from "@/components/ChatAttachMenu";
import { ConnectorsSheet } from "@/components/ConnectorsSheet";
import { ConnectorActionCard, type SuggestedConnector } from "@/components/ConnectorActionCard";
import { ImageAnnotatorModal } from "@/components/ImageAnnotatorModal";
import { StructuredMessage, type StructuredStep } from "@/components/chat/StructuredMessage";
import { MessageActions } from "@/components/chat/MessageActions";
import { FollowUpChips, type FollowUpChip } from "@/components/chat/FollowUpChips";
import { redactSecrets } from "@/lib/security/credentials";
import type { ToolCallItem } from "@/components/chat/ActionCards";
import { formatFileSize } from "@/lib/artifacts";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  artifacts?: ArtifactRef[];
  steps?: StructuredStep[];
  trace?: { toolCalls?: ToolCallItem[] };
  isEdited?: boolean;
};

type QueuedMessage = {
  id: string;
  text: string;
  artifacts?: ArtifactRef[];
};

type MissionListItem = {
  id: string;
  objective: string;
  status: string;
  isPinned?: boolean;
  projectId?: string | null;
  shareToken?: string | null;
};

type ProjectItem = { id: string; name: string };

type SuggestedPlan = { stepTitles: string[] };

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userEmail, setUserEmail] = useState("");
  const [agentName, setAgentName] = useState("Plutão");
  const [agentIdentity, setAgentIdentity] = useState("Assistente Pessoal Autônomo");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [pendingArtifacts, setPendingArtifacts] = useState<ArtifactRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isLongInputModalOpen, setIsLongInputModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [recentMissions, setRecentMissions] = useState<MissionListItem[]>([]);
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([]);
  const [suggestedPlan, setSuggestedPlan] = useState<SuggestedPlan | null>(null);
  const [suggestedConnectors, setSuggestedConnectors] = useState<SuggestedConnector[]>([])
  const [suggestedFollowUps, setSuggestedFollowUps] = useState<FollowUpChip[]>([]);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [isConnectorsSheetOpen, setIsConnectorsSheetOpen] = useState(false);
  const [annotatorArtifact, setAnnotatorArtifact] = useState<ArtifactRef | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const queueRef = useRef<QueuedMessage[]>([]);
  queueRef.current = queue;
  const isSendNowAbortRef = useRef(false);
  const isManualCancelRef = useRef(false);
  const prevSendingRef = useRef(false);
  const activeControllerRef = useRef<AbortController | null>(null);

  const addToast = (message: string, type: ToastType = "info", title?: string) => {
    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message, type, title }]);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => { scrollToBottom(); }, [messages, sending, suggestedPlan, suggestedConnectors, suggestedFollowUps]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = Math.min(window.innerHeight * 0.38, 320);
    const h = textarea.scrollHeight;
    textarea.style.height = `${Math.min(h, maxHeight)}px`;
    textarea.style.overflowY = h > maxHeight ? "auto" : "hidden";
  }, [inputMessage]);

  const refreshMissions = useCallback(async () => {
    try {
      const mRes = await fetch("/api/missions", { cache: "no-store" });
      if (mRes.ok) {
        const mData = await mRes.json();
        const list = Array.isArray(mData.missions)
          ? mData.missions.map(
              (m: {
                id: string;
                objective: string;
                status: string;
                isPinned?: boolean;
                projectId?: string | null;
                shareToken?: string | null;
              }) => ({
                id: m.id,
                objective: m.objective,
                status: m.status,
                isPinned: Boolean(m.isPinned),
                projectId: m.projectId ?? null,
                shareToken: m.shareToken ?? null,
              })
            )
          : [];
        setRecentMissions(list);
      }
    } catch { /* ignore */ }
  }, []);

  const init = useCallback(async () => {
    setError(null);
    try {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      if (!me.ok) { router.replace("/login"); return; }
      const meData = await me.json();
      const email = meData.user?.email ?? "";
      setUserEmail(email);
      const a = await fetch("/api/agent", { cache: "no-store" });
      if (a.ok) {
        const d = await a.json();
        if (d.agent?.name) setAgentName(d.agent.name);
        if (d.agent?.identity) setAgentIdentity(d.agent.identity);
      }
      try {
        const pRes = await fetch("/api/projects", { cache: "no-store" });
        if (pRes.ok) {
          const pData = await pRes.json();
          if (Array.isArray(pData.projects)) {
            setProjectsList(
              pData.projects.map((p: { id: string; name: string }) => ({
                id: p.id,
                name: p.name,
              }))
            );
          }
        }
      } catch { /* ignore */ }

      if (email) {
        const saved = localStorage.getItem(`plutao_chat_${email}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              setMessages(
                parsed.map((m: Message) =>
                  m.role === "user" && typeof m.content === "string"
                    ? { ...m, content: redactSecrets(m.content).text }
                    : m
                )
              );
            }
          } catch { /* ignore */ }
        }
        const savedMission = localStorage.getItem(`plutao_chat_mission_${email}`);
        const fromQuery = searchParams.get("mission");
        if (fromQuery) {
          setActiveMissionId(fromQuery);
          localStorage.setItem(`plutao_chat_mission_${email}`, fromQuery);
        } else if (savedMission) {
          setActiveMissionId(savedMission);
        }
      }
      await refreshMissions();
    } catch {
      addToast("Erro ao conectar à sessão do usuário", "error");
    } finally {
      setLoading(false);
    }
  }, [router, searchParams, refreshMissions]);

  useEffect(() => { void init(); }, [init]);
  useEffect(() => {
    if (userEmail && messages.length > 0) {
      localStorage.setItem(`plutao_chat_${userEmail}`, JSON.stringify(messages));
    }
  }, [messages, userEmail]);

  useEffect(() => {
    const wasSending = prevSendingRef.current;
    prevSendingRef.current = sending;

    if (wasSending && !sending) {
      if (isSendNowAbortRef.current) {
        isSendNowAbortRef.current = false;
        return;
      }
      if (isManualCancelRef.current) {
        isManualCancelRef.current = false;
        return;
      }
      if (queueRef.current.length > 0) {
        const nextMsg = queueRef.current[0];
        setQueue((prev) => prev.slice(1));
        setTimeout(() => {
          void executeSend(nextMsg.text, nextMsg.artifacts ?? []);
        }, 50);
      }
    }
  }, [sending]);

  const handleRenameMission = async (id: string, newTitle: string) => {
    const res = await fetch(`/api/missions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", title: newTitle }),
    });
    if (!res.ok) throw new Error("Falha ao renomear conversa");
    await refreshMissions();
  };

  const handlePinMission = async (id: string, isPinned: boolean) => {
    const res = await fetch(`/api/missions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pin", isPinned }),
    });
    if (!res.ok) throw new Error("Falha ao alterar fixação da conversa");
    await refreshMissions();
  };

  const handleMoveProject = async (id: string, projectId: string | null) => {
    const res = await fetch(`/api/missions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move_project", projectId }),
    });
    if (!res.ok) throw new Error("Falha ao mover para projeto");
    await refreshMissions();
  };

  const handleShareMission = async (id: string, enable: boolean): Promise<string | null> => {
    const res = await fetch(`/api/missions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "share", enable }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error("Falha ao atualizar compartilhamento");
    await refreshMissions();
    return data.shareToken ?? null;
  };

  const handleDeleteMission = async (id: string) => {
    const res = await fetch(`/api/missions/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Falha ao excluir conversa");
    if (activeMissionId === id) {
      selectMission(null);
    }
    await refreshMissions();
  };

  function selectMission(id: string | null) {
    setActiveMissionId(id);
    if (userEmail) {
      if (id) localStorage.setItem(`plutao_chat_mission_${userEmail}`, id);
      else localStorage.removeItem(`plutao_chat_mission_${userEmail}`);
    }
  }

  async function applySuggestedPlan() {
    if (!suggestedPlan || suggestedPlan.stepTitles.length === 0 || applyingPlan) return;
    setApplyingPlan(true);
    try {
      let missionId = activeMissionId;

      if (!missionId) {
        const objective =
          suggestedPlan.stepTitles[0]?.slice(0, 120) ||
          "Missão a partir do chat";
        const createRes = await fetch("/api/missions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objective,
            context: "Plano sugerido pelo Núcleo no chat",
          }),
        });
        const createData = await createRes.json().catch(() => ({}));
        if (!createRes.ok || !createData.mission?.id) {
          addToast(
            typeof createData.error === "string"
              ? createData.error
              : "Falha ao criar missão",
            "error"
          );
          return;
        }
        missionId = createData.mission.id as string;
        selectMission(missionId);
        await refreshMissions();
      }

      const planRes = await fetch(`/api/missions/${missionId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_plan",
          stepTitles: suggestedPlan.stepTitles,
          brief: {
            objective:
              recentMissions.find((m) => m.id === missionId)?.objective ??
              suggestedPlan.stepTitles[0],
          },
        }),
      });
      const planData = await planRes.json().catch(() => ({}));
      if (!planRes.ok) {
        addToast(
          typeof planData.error === "string"
            ? planData.error
            : "Falha ao gravar plano",
          "error"
        );
        return;
      }

      setSuggestedPlan(null);
      setWorkspaceKey((k) => k + 1);
      addToast("Plano gravado na missão. Revise e alinhe antes de executar.", "success");
    } catch {
      addToast("Erro de rede ao aplicar plano", "error");
    } finally {
      setApplyingPlan(false);
    }
  }

  async function executeSend(
    text: string,
    activeArtifacts: ArtifactRef[],
    overrideMessages?: Message[]
  ) {
    if (abortController) {
      isSendNowAbortRef.current = true;
      abortController.abort();
      setMessages((prev) => {
        const copy = [...prev];
        if (copy.length > 0 && copy[copy.length - 1].role === "assistant") {
          copy.pop();
        }
        return copy;
      });
    }

    setError(null);
    setSuggestedPlan(null);
    setSuggestedConnectors([]);
    setSuggestedFollowUps([]);

    let newMessages: Message[] = [];
    if (overrideMessages) {
      newMessages = overrideMessages;
    } else {
      const displayContent =
        text ||
        (activeArtifacts.length > 0
          ? `[Arquivo anexado: ${activeArtifacts.map((a) => a.name).join(", ")}]`
          : "");
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: displayContent,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        artifacts: activeArtifacts.length ? activeArtifacts : undefined,
      };
      newMessages = [...messages, userMsg];
      setMessages(newMessages);
    }

    setInputMessage("");
    setPendingArtifacts([]);
    setSending(true);

    const controller = new AbortController();
    activeControllerRef.current = controller;
    setAbortController(controller);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
        },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          artifactIds: activeArtifacts.map((a) => a.id),
          missionId: activeMissionId,
          stream: true,
        }),
        signal: controller.signal,
      });

      const isSSE = res.headers.get("content-type")?.includes("text/event-stream");

      if (isSSE && res.body) {
        const assistantId = crypto.randomUUID();
        const initialAssistantMsg: Message = {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          steps: [],
        };
        setMessages((prev) => [...prev, initialAssistantMsg]);

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.trim()) continue;
            let eventName = "message";
            let dataStr = "";

            const lines = part.split("\n");
            for (const line of lines) {
              if (line.startsWith("event: ")) eventName = line.slice(7).trim();
              else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
            }

            if (!dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr);

              if (eventName === "reasoning_step") {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    const prevSteps = m.steps ?? [];
                    const stepItem: StructuredStep = {
                      type: "reasoning",
                      reasoning: { id: parsed.id, index: parsed.index, text: parsed.text },
                    };
                    return { ...m, steps: [...prevSteps, stepItem] };
                  })
                );
              } else if (eventName === "tool_start") {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    const prevSteps = m.steps ?? [];
                    const toolItem: StructuredStep = {
                      type: "tool_call",
                      toolCall: {
                        id: parsed.id,
                        provider: parsed.provider,
                        capability: parsed.capability,
                        status: "executing",
                        summaryInput:
                          typeof parsed.summaryInput === "string"
                            ? parsed.summaryInput
                            : JSON.stringify(parsed.summaryInput ?? {}),
                      },
                    };
                    return { ...m, steps: [...prevSteps, toolItem] };
                  })
                );
              } else if (eventName === "tool_result") {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    const prevSteps = (m.steps ?? []).map((s) => {
                      if (s.type === "tool_call" && s.toolCall.id === parsed.id) {
                        return {
                          ...s,
                          toolCall: {
                            ...s.toolCall,
                            status: parsed.status,
                            summaryOutput: parsed.summaryOutput,
                            fullInput: parsed.fullInput,
                            fullOutput: parsed.fullOutput,
                            durationMs: parsed.durationMs,
                          },
                        };
                      }
                      return s;
                    });
                    return { ...m, steps: prevSteps };
                  })
                );
              } else if (eventName === "content_delta") {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    return { ...m, content: (m.content || "") + parsed.text };
                  })
                );
              } else if (eventName === "done") {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    return {
                      ...m,
                      content: parsed.full || m.content,
                      steps: parsed.steps ?? m.steps,
                      trace: parsed.trace ?? m.trace,
                    };
                  })
                );

                if (
                  parsed.suggestedPlan &&
                  Array.isArray(parsed.suggestedPlan.stepTitles) &&
                  parsed.suggestedPlan.stepTitles.length >= 3
                ) {
                  setSuggestedPlan({
                    stepTitles: parsed.suggestedPlan.stepTitles.map((t: unknown) => String(t)),
                  });
                }
                if (Array.isArray(parsed.suggestedConnectors) && parsed.suggestedConnectors.length > 0) {
                  setSuggestedConnectors(
                    parsed.suggestedConnectors
                      .filter((c: unknown): c is Record<string, unknown> => typeof c === "object" && c !== null)
                      .map((c: Record<string, unknown>) => ({
                        provider: String(c.provider ?? ""),
                        displayName: String(c.displayName ?? c.provider ?? ""),
                        status: String(c.status ?? "disconnected"),
                        reason: c.reason ? String(c.reason) : undefined,
                      }))
                      .filter((c: SuggestedConnector) => c.provider.length > 0)
                  );
                }
                if (parsed.modelFallback) {
                  addToast("Provedor principal indisponível, respondendo com modelo de contingência.", "warning");
                }
                if (Array.isArray(parsed.suggestedFollowUps) && parsed.suggestedFollowUps.length > 0) {
                  setSuggestedFollowUps(
                    parsed.suggestedFollowUps
                      .filter((f: unknown): f is Record<string, unknown> => typeof f === "object" && f !== null)
                      .map((f: Record<string, unknown>, i: number) => ({
                        id: String(f.id ?? ("fu-" + i)),
                        label: String(f.label ?? ""),
                        prompt: String(f.prompt ?? ""),
                      }))
                      .filter((f: FollowUpChip) => f.label.length > 0 && f.prompt.length > 0)
                  );
                }
              } else if (eventName === "error") {
                addToast(parsed.error || "Erro durante transmissão", "error");
              }
            } catch {
              /* ignore JSON parse errors */
            }
          }
        }
      } else {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errMsg =
            typeof data.error === "string" && data.error.trim()
              ? data.error
              : `Falha ao enviar (${res.status})`;
          setError(errMsg);
          addToast(errMsg, "error");
          return;
        }
        const reply =
          typeof data.message?.content === "string" ? data.message.content.trim() : "";
        if (reply) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant" as const,
              content: reply,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              steps: Array.isArray(data.steps) ? data.steps : undefined,
              trace: data.trace ?? undefined,
            },
          ]);
        } else {
          const errMsg = "Resposta vazia do servidor. Tente novamente.";
          setError(errMsg);
          addToast(errMsg, "error");
        }

        if (
          data.suggestedPlan &&
          Array.isArray(data.suggestedPlan.stepTitles) &&
          data.suggestedPlan.stepTitles.length >= 3
        ) {
          setSuggestedPlan({
            stepTitles: data.suggestedPlan.stepTitles.map((t: unknown) => String(t)),
          });
        }
        if (Array.isArray(data.suggestedConnectors) && data.suggestedConnectors.length > 0) {
          setSuggestedConnectors(
            data.suggestedConnectors
              .filter((c: unknown): c is Record<string, unknown> => typeof c === "object" && c !== null)
              .map((c: Record<string, unknown>) => ({
                provider: String(c.provider ?? ""),
                displayName: String(c.displayName ?? c.provider ?? ""),
                status: String(c.status ?? "disconnected"),
                reason: c.reason ? String(c.reason) : undefined,
              }))
              .filter((c: SuggestedConnector) => c.provider.length > 0)
          );
        } else {
          setSuggestedConnectors([]);
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        addToast("Transmissão cancelada pelo usuário.", "info");
      } else {
        const errMsg = "Erro de rede ao enviar";
        setError(errMsg);
        addToast(errMsg, "error");
      }
    } finally {
      if (activeControllerRef.current === controller) {
        setSending(false);
        setAbortController(null);
        activeControllerRef.current = null;
      }
      // no auto-focus after send (mobile keyboard)
    }
  }

  async function handleSend(
    e?: FormEvent,
    overrideText?: string,
    overrideArtifacts?: ArtifactRef[]
  ) {
    if (e) e.preventDefault();
    const textRaw = (overrideText ?? inputMessage).trim();
    const activeArtifacts = overrideArtifacts ?? [...pendingArtifacts];

    if (!textRaw && activeArtifacts.length === 0) return;

    if (sending) {
      if (queue.length >= 3) {
        addToast("Aguarde o Plutão responder", "warning");
        return;
      }
      if (textRaw.length > 4000) {
        addToast("Mensagem excede 4.000 caracteres.", "error");
        return;
      }
      const redacted = redactSecrets(textRaw);
      if (redacted.hadSecrets) {
        addToast(
          "Credencial detectada e mascarada. Use Conectores para ligar APIs. Revogue a chave se vazou em texto claro.",
          "warning",
          "Seguranca"
        );
      }
      const newQueued: QueuedMessage = {
        id: crypto.randomUUID(),
        text: redacted.text,
        artifacts: activeArtifacts.length > 0 ? activeArtifacts : undefined,
      };
      setQueue((prev) => [...prev, newQueued]);
      setInputMessage("");
      setPendingArtifacts([]);
      return;
    }

    if (textRaw.length > 4000) {
      addToast("Mensagem excede 4.000 caracteres.", "error");
      return;
    }
    const redacted = redactSecrets(textRaw);

    if (editingMessageId) {
      await handleSaveEditedMessage(redacted.text, activeArtifacts);
    } else {
      await executeSend(redacted.text, activeArtifacts);
    }
  }

  function handleSendNow(index = 0) {
    if (queueRef.current.length === 0) return;
    const targetItem = queueRef.current[index] ?? queueRef.current[0];
    setQueue((prev) => prev.filter((_, i) => i !== index));
    void executeSend(targetItem.text, targetItem.artifacts ?? []);
  }

  function handleDiscardQueue(index = 0) {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  function handleStartEditMessage(msg: Message) {
    if (sending || msg.role !== "user") return;
    setEditingMessageId(msg.id);
    setInputMessage(msg.content);
    if (msg.artifacts) {
      setPendingArtifacts(msg.artifacts);
    }
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function handleCancelEdit() {
    setEditingMessageId(null);
    setInputMessage("");
    setPendingArtifacts([]);
  }

  async function handleSaveEditedMessage(editedText: string, activeArtifacts: ArtifactRef[]) {
    if (!editingMessageId) return;

    const targetIdx = messages.findIndex((m) => m.id === editingMessageId);
    if (targetIdx === -1) {
      setEditingMessageId(null);
      return;
    }

    const updatedUserMsg: Message = {
      ...messages[targetIdx],
      content: editedText,
      artifacts: activeArtifacts.length > 0 ? activeArtifacts : undefined,
      isEdited: true,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    // Truncate history after this user message
    const truncatedHistory = messages.slice(0, targetIdx);
    setMessages([...truncatedHistory, updatedUserMsg]);

    setEditingMessageId(null);
    setInputMessage("");
    setPendingArtifacts([]);

    // Call backend patch endpoint to persist edit
    fetch(`/api/chat/messages/${editingMessageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editedText }),
    }).catch(() => {/* ignore if table not present */});

    // Trigger regeneration from this truncated point
    await executeSend(editedText, activeArtifacts, [...truncatedHistory, updatedUserMsg]);
  }

  async function regenerateLast() {
    if (sending) return;
    const lastUser = [...messages].reverse().find((x) => x.role === "user");
    if (!lastUser) return;
    setMessages((prev) => {
      const next = [...prev];
      while (next.length && next[next.length - 1]?.role === "assistant") next.pop();
      return next;
    });
    setInputMessage(lastUser.content);
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) ta.closest("form")?.requestSubmit();
    }, 40);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleConfirmTransform(artifact: ArtifactRef) {
    setPendingArtifacts((prev) => [...prev, artifact]);
    setInputMessage("");
    setIsLongInputModalOpen(false);
    addToast(`Arquivo "${artifact.name}" anexado`, "success");
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        const isPlainText = [
          "md", "markdown", "txt", "csv", "html", "htm", "css",
          "json", "js", "ts", "jsx", "tsx", "py", "log", "xml", "yaml", "yml"
        ].includes(ext) || file.type.startsWith("text/");

        if (isPlainText) {
          const content = await file.text();
          if (!content.trim()) {
            addToast(`O arquivo "${file.name}" está vazio.`, "error");
            continue;
          }
          const res = await fetch("/api/artifacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content,
              name: file.name,
              type: file.type || undefined,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.artifact) {
            addToast(data.error ?? `Falha ao enviar "${file.name}"`, "error");
            continue;
          }
          const meta = data.artifact.metadata || {};
          const isImg = Boolean(meta.isImage) || (data.artifact.type && data.artifact.type.startsWith("image/"));
          const thumbnailUrl = isImg ? ((meta.blobUrl as string) || (meta.dataUrl as string) || undefined) : undefined;

          setPendingArtifacts((prev) => [...prev, {
            id: data.artifact.id,
            name: data.artifact.name,
            type: data.artifact.type,
            size: data.artifact.size,
            thumbnailUrl,
          }]);
          addToast(`Arquivo "${data.artifact.name}" anexado`, "success");
        } else {
          // Binary files (PDF, Excel) and Images via FormData
          const formData = new FormData();
          formData.append("file", file);
          if (activeMissionId) formData.append("missionId", activeMissionId);

          const res = await fetch("/api/artifacts", {
            method: "POST",
            body: formData,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.artifact) {
            addToast(data.error ?? `Falha ao processar "${file.name}"`, "error");
            continue;
          }
          const meta = data.artifact.metadata || {};
          const isImg = Boolean(meta.isImage) || (data.artifact.type && data.artifact.type.startsWith("image/"));
          const thumbnailUrl = isImg ? ((meta.blobUrl as string) || (meta.dataUrl as string) || undefined) : undefined;

          setPendingArtifacts((prev) => [...prev, {
            id: data.artifact.id,
            name: data.artifact.name,
            type: data.artifact.type,
            size: data.artifact.size,
            thumbnailUrl,
          }]);
          addToast(`Arquivo "${data.artifact.name}" anexado`, "success");
        }
      } catch (err) {
        console.error("Erro ao ler arquivo:", err);
        addToast(`Erro ao processar "${file.name}"`, "error");
      }
    }

    if (e.target) {
      e.target.value = "";
    }
  };

  const charCount = inputMessage.length;
  const showLongInputHint = charCount >= 1500;

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-[var(--text-muted)] text-sm font-mono">
        Carregando Chat Plutão…
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--base)] text-[var(--text-primary)] pb-20 sm:pb-4">
      <>
      <ChatHistoryDrawer
        open={isChatMenuOpen}
        onClose={() => setIsChatMenuOpen(false)}
        userEmail={userEmail}
        userInitial={(userEmail?.[0] || "P").toUpperCase()}
        history={recentMissions.map((m) => {
          const proj = projectsList.find((p) => p.id === m.projectId);
          return {
            id: m.id,
            title: m.objective || "Missão",
            subtitle: m.status,
            isPinned: m.isPinned,
            projectId: m.projectId,
            projectName: proj?.name,
            shareToken: m.shareToken,
          };
        })}
        onNewChat={() => {
          setMessages([]);
          setSuggestedPlan(null);
          setSuggestedConnectors([]);
          setError(null);
          if (userEmail) localStorage.removeItem(`plutao_chat_${userEmail}`);
        }}
        onSelectHistory={(id) => selectMission(id)}
        onRename={handleRenameMission}
        onPin={handlePinMission}
        onMoveProject={handleMoveProject}
        onShare={handleShareMission}
        onDelete={handleDeleteMission}
        projectsList={projectsList}
        onNotify={(msg, type) => addToast(msg, type ?? "info")}
      />
      <Header
        userEmail={userEmail}
        onNotify={(msg, type) => addToast(msg, type)}
        variant="chat"
        onOpenMenu={() => setIsChatMenuOpen(true)}
        onNewChat={() => {
          setMessages([]);
          setSuggestedPlan(null);
          setSuggestedConnectors([]);
          setError(null);
          if (userEmail) localStorage.removeItem(`plutao_chat_${userEmail}`);
        }}
      />
    </>
      <main className="flex-1 mx-auto max-w-4xl w-full flex flex-col p-4 overflow-hidden">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-sm font-bold text-[var(--selo)]">P</div>
            <h2 className="text-xl font-semibold">Conversar com {agentName}</h2>
            <p className="text-xs text-[var(--text-secondary)] max-w-md">{agentIdentity}</p>
            <p className="text-[11px] text-[var(--text-muted)] max-w-sm">
              Conversa livre ou projeto: o Núcleo descobre a intenção, alinha o caminho e só então executa.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pb-4">
            <div className="flex justify-between text-[10px] text-[var(--text-muted)] border-b border-[var(--border)]/40 pb-2">
              <span>Histórico ({messages.length})</span>
              <button type="button" onClick={() => setIsClearModalOpen(true)}>Limpar</button>
            </div>
            {messages.map((m) => (
              <div key={m.id} className={`group flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-[var(--selo)] text-[var(--base)]"
                      : "bg-[var(--surface)] border border-[var(--border)]"
                  }`}
                >
                  {m.role === "user" && !sending && (
                    <button
                      type="button"
                      onClick={() => handleStartEditMessage(m)}
                      title="Editar mensagem"
                      aria-label="Editar mensagem"
                      className="absolute -left-7 top-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                  )}
                  <StructuredMessage
                    role={m.role}
                    content={m.content}
                    steps={m.steps}
                    trace={m.trace}
                    isStreaming={sending && m.id === messages[messages.length - 1]?.id}
                    isEdited={m.isEdited}
                  />
                  {m.role === "assistant" && m.content.trim() ? (
                    <MessageActions
                      content={m.content}
                      disabled={sending}
                      onRegenerate={() => void regenerateLast()}
                    />
                  ) : null}
                  {m.artifacts?.map((art) =>
                    art.thumbnailUrl ? (
                      <div key={art.id} className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAnnotatorArtifact(art)}
                          className="w-12 h-12 rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--selo)] transition-colors shrink-0 cursor-pointer"
                          title="Clique para visualizar/anotar"
                        >
                          <img src={art.thumbnailUrl} alt={art.name} className="w-full h-full object-cover" />
                        </button>
                        <div className="flex flex-col text-[10px] font-mono opacity-80">
                          <span className="font-semibold truncate max-w-[140px]">{art.name}</span>
                          <span>{formatFileSize(art.size)}</span>
                        </div>
                      </div>
                    ) : (
                      <span key={art.id} className="inline-block mt-1 text-[10px] font-mono opacity-80">
                        {art.name} ({formatFileSize(art.size)})
                      </span>
                    )
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span>{agentName} processando…</span>
                {abortController && (
                  <button
                    type="button"
                    onClick={() => {
                      isManualCancelRef.current = true;
                      abortController.abort();
                    }}
                    className="ml-2 px-2 py-0.5 rounded border border-rose-500/40 text-rose-400 text-[10px] hover:bg-rose-500/10 cursor-pointer font-mono"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}

            {suggestedPlan && suggestedPlan.stepTitles.length >= 3 ? (
              <div className="rounded-2xl border border-[var(--selo)]/40 bg-[var(--surface)] p-3 space-y-2">
                <div className="text-[11px] font-medium text-[var(--selo)]">
                  Plano sugerido ({suggestedPlan.stepTitles.length} passos)
                </div>
                <ol className="text-[11px] text-[var(--text-secondary)] list-decimal list-inside space-y-0.5">
                  {suggestedPlan.stepTitles.map((t, i) => (
                    <li key={i} className="truncate">{t}</li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={applyingPlan}
                    onClick={() => void applySuggestedPlan()}
                    className="px-3 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-[11px] font-semibold disabled:opacity-40"
                  >
                    {applyingPlan
                      ? "Gravando…"
                      : activeMissionId
                        ? "Aplicar na missão ativa"
                        : "Criar missão e gravar plano"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestedPlan(null)}
                    className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-[11px] text-[var(--text-muted)]"
                  >
                    Dispensar
                  </button>
                </div>
              </div>
            ) : null}

            {suggestedConnectors.length > 0 ? (
              <div className="flex justify-start">
                <ConnectorActionCard
                  items={suggestedConnectors}
                  onDismiss={() => setSuggestedConnectors([])}
                  onNotify={(msg, type) => addToast(msg, type ?? "info")}
                  onOpenManage={() => {
                    setSuggestedConnectors([]);
                    setIsConnectorsSheetOpen(true);
                  }}
                />
              </div>
            ) : null}

            {suggestedFollowUps.length > 0 ? (
              <FollowUpChips
                items={suggestedFollowUps}
                disabled={sending}
                onDismiss={() => setSuggestedFollowUps([])}
                onSelect={(prompt) => {
                  setSuggestedFollowUps([]);
                  void handleSend(undefined, prompt);
                }}
              />
            ) : null}

            <div ref={messagesEndRef} />
          </div>
        )}

        {error && (
          <div className="mb-2 p-3 rounded-xl border border-[var(--danger)]/50 text-[var(--danger)] text-xs flex items-center justify-between gap-2 bg-[var(--surface)] font-mono">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void regenerateLast()}
              className="px-2.5 py-1 rounded-lg bg-[var(--selo)] text-[var(--base)] font-bold text-[11px] shrink-0 cursor-pointer font-sans"
            >
              Tentar com outro modelo
            </button>
          </div>
        )}

        <div className="space-y-2 mb-2">
          {messages.length === 0 && recentMissions.length > 0 ? (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">Missão</span>
              <button
                type="button"
                onClick={() => selectMission(null)}
                className={`shrink-0 px-2 py-1 rounded-lg text-[10px] border ${
                  !activeMissionId
                    ? "border-[var(--selo)] text-[var(--selo)]"
                    : "border-[var(--border)] text-[var(--text-muted)]"
                  }`}
              >
                Só chat
              </button>
              {recentMissions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectMission(m.id)}
                  title={m.objective}
                  className={`shrink-0 max-w-[140px] truncate px-2 py-1 rounded-lg text-[10px] border ${
                    activeMissionId === m.id
                      ? "border-[var(--selo)] text-[var(--selo)]"
                      : "border-[var(--border)] text-[var(--text-muted)]"
                  }`}
                >
                  {m.objective.slice(0, 28)}
                </button>
              ))}
            </div>
          ) : null}
          <MissionWorkspaceBar
            key={workspaceKey}
            missionId={activeMissionId}
            onNotify={(msg, type) => addToast(msg, type ?? "info")}
          />
        </div>

        {editingMessageId && (
          <div className="flex items-center justify-between gap-2 p-2 rounded-xl border border-[var(--selo)]/40 bg-[var(--surface)] text-xs font-mono">
            <span className="text-[var(--selo)] font-semibold">Editando mensagem do usuário</span>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancelar edição
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="space-y-2">
          {queue.length > 0 && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[var(--selo)]/40 bg-[var(--surface)]/90 text-xs shadow-sm">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[var(--selo)]/15 text-[var(--selo)]">
                  Fila
                </span>
                {queue.length > 1 && (
                  <span className="shrink-0 text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    {queue.length} na fila
                  </span>
                )}
                <span className="truncate text-[var(--text-primary)] font-medium">
                  {queue[0].text || (queue[0].artifacts?.length ? "Anexo(s)" : "")}
                </span>
                {queue[0].artifacts && queue[0].artifacts.length > 0 && (
                  <span className="shrink-0 text-[10px] text-[var(--text-muted)] font-mono">
                    (+{queue[0].artifacts.length} {queue[0].artifacts.length === 1 ? "anexo" : "anexos"})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => handleSendNow(0)}
                  className="px-2.5 py-1 rounded-lg bg-[var(--selo)] text-[var(--base)] font-semibold hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1"
                >
                  ↑ Enviar agora
                </button>
                <button
                  type="button"
                  onClick={() => handleDiscardQueue(0)}
                  className="px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-[var(--danger)]/50 transition-colors cursor-pointer"
                  title="Descartar mensagem enfileirada"
                >
                  🗑 Descartar
                </button>
              </div>
            </div>
          )}
          {pendingArtifacts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingArtifacts.map((art) =>
                art.thumbnailUrl ? (
                  <div key={art.id} className="flex items-center gap-2 p-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs">
                    <button
                      type="button"
                      onClick={() => setAnnotatorArtifact(art)}
                      className="relative w-12 h-12 rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--selo)] transition-colors shrink-0 group/img cursor-pointer"
                      title="Clique para visualizar/anotar"
                    >
                      <img src={art.thumbnailUrl} alt={art.name} className="w-full h-full object-cover" />
                      <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-xs text-white transition-opacity font-medium">✏️</span>
                    </button>
                    <div className="flex flex-col min-w-0 pr-1">
                      <span className="truncate max-w-[120px] text-xs font-medium text-[var(--text-primary)]">{art.name}</span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">{formatFileSize(art.size)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingArtifacts((p) => p.filter((a) => a.id !== art.id))}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div key={art.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs">
                    <span className="truncate max-w-[140px]">{art.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">{formatFileSize(art.size)}</span>
                    <button type="button" onClick={() => setPendingArtifacts((p) => p.filter((a) => a.id !== art.id))} className="cursor-pointer">✕</button>
                  </div>
                )
              )}
            </div>
          )}
          <div className="p-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] flex items-end gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => void handleFileSelect(e)}
              multiple
              accept=".md,.markdown,.txt,.csv,.html,.htm,.css,.json,.js,.ts,.jsx,.tsx,.py,.log,.xml,.yaml,.yml,.pdf,.xlsx,.xls,image/*"
              className="hidden"
            />
            <ChatAttachMenu
              disabled={sending}
              onOpenFiles={() => fileInputRef.current?.click()}
              onPasteLongText={() => setIsLongInputModalOpen(true)}
              onOpenConnectors={() => setIsConnectorsSheetOpen(true)}
            />
            <textarea
              ref={textareaRef}
              rows={1}
              maxLength={4000}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                queue.length >= 3
                  ? "Aguarde o Plutão responder…"
                  : pendingArtifacts.length
                    ? "Instrução sobre o arquivo…"
                    : `Mensagem para ${agentName}…`
              }
              disabled={queue.length >= 3}
              className="flex-1 bg-transparent px-2 py-1 text-base focus:outline-none min-h-[36px] max-h-[320px]"
            />
            <button
              type="submit"
              disabled={queue.length >= 3 || (!inputMessage.trim() && pendingArtifacts.length === 0)}
              className="px-4 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold disabled:opacity-40 font-mono cursor-pointer"
            >
              {editingMessageId ? "Salvar e Regenerar" : "Enviar"}
            </button>
          </div>
          {showLongInputHint && (
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl border border-[var(--selo)]/30 bg-[var(--selo)]/10 text-xs">
              <span>Texto longo detectado. Salvar como arquivo antes de enviar?</span>
              <button type="button" onClick={() => setIsLongInputModalOpen(true)} className="px-3 py-1 rounded-lg bg-[var(--selo)] text-[var(--base)] font-semibold">
                Salvar arquivo
              </button>
            </div>
          )}
        </form>
      </main>

      <MobileNav />
      <ConfirmModal
        isOpen={isClearModalOpen}
        title="Limpar histórico?"
        message="As mensagens desta sessão serão excluídas."
        confirmLabel="Limpar"
        cancelLabel="Cancelar"
        isDanger
        onConfirm={() => {
          setMessages([]);
          if (userEmail) localStorage.removeItem(`plutao_chat_${userEmail}`);
          setIsClearModalOpen(false);
        }}
        onCancel={() => setIsClearModalOpen(false)}
      />
      <LongInputModal
        isOpen={isLongInputModalOpen}
        initialText={inputMessage}
        onClose={() => setIsLongInputModalOpen(false)}
        onConfirmTransform={handleConfirmTransform}
        onOpenFileSelector={() => fileInputRef.current?.click()}
        onError={(msg) => addToast(msg, "error")}
      />
      <ConnectorsSheet
        open={isConnectorsSheetOpen}
        onClose={() => setIsConnectorsSheetOpen(false)}
        onNotify={(msg, type) => addToast(msg, type ?? "info")}
      />
      <ImageAnnotatorModal
        artifact={annotatorArtifact}
        onClose={() => setAnnotatorArtifact(null)}
        onSaveAnnotatedCopy={(newArtifact) => {
          setPendingArtifacts((prev) => [...prev, newArtifact]);
          addToast(`Cópia anotada "${newArtifact.name}" anexada`, "success");
        }}
        activeMissionId={activeMissionId}
        onError={(msg) => addToast(msg, "error")}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center text-[var(--text-muted)] text-sm font-mono">
          Carregando Chat Plutão…
        </div>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}
