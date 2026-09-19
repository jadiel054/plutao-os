"use client";

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState, KeyboardEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { ToastContainer, ToastMessage, ToastType } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { LongInputModal, type ArtifactRef } from "@/components/LongInputModal";
import { MissionWorkspaceBar } from "@/components/MissionWorkspaceBar";
import { ChatAttachMenu } from "@/components/ChatAttachMenu";
import { ConnectorsSheet } from "@/components/ConnectorsSheet";
import { ConnectorActionCard, type SuggestedConnector } from "@/components/ConnectorActionCard";
import { formatFileSize } from "@/lib/artifacts";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  artifacts?: ArtifactRef[];
};

type MissionListItem = { id: string; objective: string; status: string };

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
  const [suggestedPlan, setSuggestedPlan] = useState<SuggestedPlan | null>(null);
  const [suggestedConnectors, setSuggestedConnectors] = useState<SuggestedConnector[]>([]);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [isConnectorsSheetOpen, setIsConnectorsSheetOpen] = useState(false);

  const addToast = (message: string, type: ToastType = "info", title?: string) => {
    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message, type, title }]);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => { scrollToBottom(); }, [messages, sending, suggestedPlan, suggestedConnectors]);

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
      const mRes = await fetch("/api/missions?limit=8", { cache: "no-store" });
      if (mRes.ok) {
        const mData = await mRes.json();
        const list = Array.isArray(mData.missions)
          ? mData.missions.map((m: { id: string; objective: string; status: string }) => ({
              id: m.id,
              objective: m.objective,
              status: m.status,
            }))
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
      if (email) {
        const saved = localStorage.getItem(`plutao_chat_${email}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) setMessages(parsed);
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

  async function handleSend(e?: FormEvent) {
    if (e) e.preventDefault();
    const text = inputMessage.trim();
    if ((!text && pendingArtifacts.length === 0) || sending) return;
    if (text.length > 4000) {
      addToast("Mensagem excede 4.000 caracteres.", "error");
      return;
    }
    setError(null);
    setSuggestedPlan(null);
    setSuggestedConnectors([]);
    const activeArtifacts = [...pendingArtifacts];
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
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputMessage("");
    setPendingArtifacts([]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          artifactIds: activeArtifacts.map((a) => a.id),
          missionId: activeMissionId,
        }),
      });
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
    } catch {
      const errMsg = "Erro de rede ao enviar";
      setError(errMsg);
      addToast(errMsg, "error");
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
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
          setPendingArtifacts((prev) => [...prev, {
            id: data.artifact.id,
            name: data.artifact.name,
            type: data.artifact.type,
            size: data.artifact.size,
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
          setPendingArtifacts((prev) => [...prev, {
            id: data.artifact.id,
            name: data.artifact.name,
            type: data.artifact.type,
            size: data.artifact.size,
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
      <Header userEmail={userEmail} onNotify={(msg, type) => addToast(msg, type)} />
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
              <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-[var(--selo)] text-[var(--base)]"
                      : "bg-[var(--surface)] border border-[var(--border)]"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.artifacts?.map((art) => (
                    <span key={art.id} className="inline-block mt-1 text-[10px] font-mono opacity-80">
                      {art.name} ({formatFileSize(art.size)})
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {sending && <div className="text-xs text-[var(--text-muted)]">{agentName} processando…</div>}

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

            <div ref={messagesEndRef} />
          </div>
        )}

        {error && (
          <div className="mb-2 p-2 rounded-xl border border-[var(--danger)]/50 text-[var(--danger)] text-xs">
            {error}
          </div>
        )}

        <div className="space-y-2 mb-2">
          {recentMissions.length > 0 ? (
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

        <form onSubmit={handleSend} className="space-y-2">
          {pendingArtifacts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingArtifacts.map((art) => (
                <div key={art.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs">
                  <span className="truncate max-w-[140px]">{art.name}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{formatFileSize(art.size)}</span>
                  <button type="button" onClick={() => setPendingArtifacts((p) => p.filter((a) => a.id !== art.id))}>✕</button>
                </div>
              ))}
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
              placeholder={pendingArtifacts.length ? "Instrução sobre o arquivo…" : `Mensagem para ${agentName}…`}
              disabled={sending}
              className="flex-1 bg-transparent px-2 py-1 text-base focus:outline-none min-h-[36px] max-h-[320px]"
            />
            <button
              type="submit"
              disabled={sending || (!inputMessage.trim() && pendingArtifacts.length === 0)}
              className="px-4 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold disabled:opacity-40"
            >
              Enviar
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
