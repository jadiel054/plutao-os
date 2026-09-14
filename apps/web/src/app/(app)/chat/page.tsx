"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { ToastContainer, ToastMessage, ToastType } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export default function ChatPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [agentName, setAgentName] = useState("Plutão");
  const [agentIdentity, setAgentIdentity] = useState("Assistente Pessoal Autônomo");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Modals & Toasts
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: ToastType = "info", title?: string) => {
    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message, type, title }]);
  };
  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const init = useCallback(async () => {
    setError(null);
    try {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      if (!me.ok) {
        router.replace("/login");
        return;
      }
      const meData = await me.json();
      const email = meData.user?.email ?? "";
      setUserEmail(email);

      // Carrega perfil do agente
      const a = await fetch("/api/agent", { cache: "no-store" });
      if (a.ok) {
        const d = await a.json();
        if (d.agent) {
          if (d.agent.name) setAgentName(d.agent.name);
          if (d.agent.identity) setAgentIdentity(d.agent.identity);
        }
      }

      // Restaura histórico local do usuário se existir
      if (typeof window !== "undefined" && email) {
        const saved = localStorage.getItem(`plutao_chat_${email}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) setMessages(parsed);
          } catch {
            /* ignore invalid JSON */
          }
        }
      }
    } catch {
      setError("Erro de conexão ao carregar sessão");
      addToast("Erro ao conectar à sessão do usuário", "error");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void init();
  }, [init]);

  // Persiste mensagens no localStorage quando alteradas
  useEffect(() => {
    if (userEmail && messages.length > 0) {
      localStorage.setItem(`plutao_chat_${userEmail}`, JSON.stringify(messages));
    }
  }, [messages, userEmail]);

  async function handleSend(e?: FormEvent) {
    if (e) e.preventDefault();
    const text = inputMessage.trim();
    if (!text || sending) return;

    setError(null);
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputMessage("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error ?? "Falha ao enviar mensagem";
        setError(errMsg);
        addToast(errMsg, "error", "Erro ao enviar");
        return;
      }

      if (data.message) {
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.message.content,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch {
      const errMsg = "Erro de rede ao enviar mensagem ao agente";
      setError(errMsg);
      addToast(errMsg, "error");
    } finally {
      setSending(false);
    }
  }

  function handleQuickPrompt(prompt: string) {
    setInputMessage(prompt);
  }

  function confirmClearHistory() {
    setMessages([]);
    if (userEmail) {
      localStorage.removeItem(`plutao_chat_${userEmail}`);
    }
    setIsClearModalOpen(false);
    addToast("Histórico de mensagens limpo", "info");
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-[var(--text-muted)] text-sm font-mono">
        Carregando Chat Plutão…
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--base)] text-[var(--text-primary)] pb-20 sm:pb-4">
      {/* Header Unificado com Indicador Global e Menu de Usuário */}
      <Header
        userEmail={userEmail}
        onNotify={(msg, type) => addToast(msg, type)}
      />

      {/* Main Chat Content */}
      <main className="flex-1 mx-auto max-w-4xl w-full flex flex-col p-4 overflow-hidden">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-2xl shadow-inner animate-bounce">
              🤖
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="text-xl font-semibold tracking-tight">Conversar com {agentName}</h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {agentIdentity}. Digite uma mensagem ou selecione uma sugestão rápida abaixo para começar.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full pt-4">
              <button
                type="button"
                onClick={() => handleQuickPrompt("Qual é o status das minhas missões atuais?")}
                className="p-3 text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--selo)] transition-all text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] space-y-1 group cursor-pointer"
              >
                <div className="font-medium text-[var(--text-primary)] group-hover:text-[var(--selo)]">
                  📊 Status de Missões
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">Perguntar sobre o progresso atual</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt("Me ajude a planejar uma nova missão.")}
                className="p-3 text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--selo)] transition-all text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] space-y-1 group cursor-pointer"
              >
                <div className="font-medium text-[var(--text-primary)] group-hover:text-[var(--selo)]">
                  🎯 Planejar Nova Missão
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">Definir objetivos e passos</div>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
            <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] border-b border-[var(--border)]/40 pb-2">
              <span>Histórico de conversa ({messages.length} mensagens)</span>
              <button
                type="button"
                onClick={() => setIsClearModalOpen(true)}
                className="hover:text-[var(--danger)] transition-colors px-2 py-0.5 rounded hover:bg-red-500/10 cursor-pointer"
              >
                Limpar histórico
              </button>
            </div>

            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-[var(--selo)] text-[var(--base)] font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    P
                  </div>
                )}
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                    m.role === "user"
                      ? "bg-[var(--selo)] text-[var(--base)] rounded-br-none"
                      : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] rounded-bl-none"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  <div
                    className={`text-[9px] mt-1 text-right font-mono ${
                      m.role === "user" ? "text-[var(--base)]/70" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {m.timestamp}
                  </div>
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex gap-3 justify-start items-center">
                <div className="w-7 h-7 rounded-full bg-[var(--selo)] text-[var(--base)] font-bold flex items-center justify-center text-xs shrink-0">
                  P
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl rounded-bl-none px-4 py-2 text-xs text-[var(--text-muted)] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--cyan)] animate-ping" />
                  {agentName} está pensando…
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {error && (
          <div className="mb-3 p-3 rounded-xl border border-[var(--danger)]/50 bg-[var(--danger)]/10 text-[var(--danger)] text-xs flex justify-between items-center">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-bold px-1.5 py-0.5 rounded hover:bg-[var(--danger)]/20 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Input Bar */}
        <form onSubmit={handleSend} className="pt-2 sticky bottom-0 bg-[var(--base)]">
          <div className="flex items-center gap-2 p-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--selo)] transition-all">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={`Enviar mensagem para ${agentName}…`}
              disabled={sending}
              className="flex-1 bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !inputMessage.trim()}
              className="px-4 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-medium hover:bg-[var(--nucleo)] disabled:opacity-40 disabled:hover:bg-[var(--selo)] transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              {sending ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-[var(--base)]/30 border-t-[var(--base)] animate-spin" />
                  Enviando
                </>
              ) : (
                <>Enviar</>
              )}
            </button>
          </div>
        </form>
      </main>

      {/* Mobile Navigation */}
      <MobileNav />

      {/* Confirmation Modal for Clear History */}
      <ConfirmModal
        isOpen={isClearModalOpen}
        title="Limpar histórico de conversa?"
        message="Todas as mensagens trocadas nesta sessão serão excluídas permanentemente."
        confirmLabel="Limpar Histórico"
        cancelLabel="Cancelar"
        isDanger={true}
        onConfirm={confirmClearHistory}
        onCancel={() => setIsClearModalOpen(false)}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
