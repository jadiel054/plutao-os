"use client";

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { ToastContainer, ToastMessage, ToastType } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { LongInputModal } from "@/components/LongInputModal";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Modals & Toasts
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isLongInputModalOpen, setIsLongInputModalOpen] = useState(false);
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

  // Auto-expand textarea behavior
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const maxHeight = Math.min(window.innerHeight * 0.38, 320);
    const scrollHeight = textarea.scrollHeight;

    if (scrollHeight > maxHeight) {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = "auto";
    } else {
      textarea.style.height = `${scrollHeight}px`;
      textarea.style.overflowY = "hidden";
    }
  }, [inputMessage]);

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

    if (text.length > 4000) {
      addToast("Mensagem excede o limite máximo de 4.000 caracteres.", "error", "Limite Excedido");
      return;
    }

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
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleQuickPrompt(prompt: string) {
    setInputMessage(prompt);
    textareaRef.current?.focus();
  }

  function confirmClearHistory() {
    setMessages([]);
    if (userEmail) {
      localStorage.removeItem(`plutao_chat_${userEmail}`);
    }
    setIsClearModalOpen(false);
    addToast("Histórico de mensagens limpo", "info");
  }

  function handleConfirmTransform(transformedText: string) {
    setInputMessage(transformedText);
    setIsLongInputModalOpen(false);
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.selectionStart = el.value.length;
        el.selectionEnd = el.value.length;
      }
    }, 50);
  }

  // Character counter color derivation
  const charCount = inputMessage.length;
  const showCounter = charCount >= 2500;
  const getCounterColor = () => {
    if (charCount > 3800) return "text-red-400 font-bold";
    if (charCount > 3200) return "text-amber-400 font-medium";
    return "text-[var(--text-muted)]";
  };

  // Smart Long-Input trigger inline hint
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

        {/* Composer Input Bar */}
        <form onSubmit={handleSend} className="pt-2 sticky bottom-0 bg-[var(--base)] space-y-2">
          <div className="p-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--selo)] transition-all space-y-2">
            <div className="flex items-end gap-2">
              {/* Anexos '+' Button placeholder */}
              <button
                type="button"
                className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--base)] transition-colors text-lg shrink-0 cursor-pointer"
                title="Anexar arquivo (em breve)"
              >
                +
              </button>

              {/* Auto-expanding Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                maxLength={4000}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Enviar mensagem para ${agentName}…`}
                disabled={sending}
                enterKeyHint="send"
                style={{ resize: "none" }}
                className="flex-1 bg-transparent px-2 py-1 text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none disabled:opacity-50 min-h-[36px] max-h-[320px] overflow-y-hidden leading-snug"
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={sending || !inputMessage.trim()}
                className="px-4 py-2.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:bg-[var(--nucleo)] disabled:opacity-40 disabled:hover:bg-[var(--selo)] transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer self-end mb-0.5"
              >
                {sending ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--base)]/30 border-t-[var(--base)] animate-spin" />
                    Enviando
                  </>
                ) : (
                  <>Enviar</>
                )}
              </button>
            </div>

            {/* Character counter (>= 2500) */}
            {showCounter && (
              <div className="flex justify-end px-2 pt-1 border-t border-[var(--border)]/40 text-[11px] font-mono">
                <span className={getCounterColor()}>
                  {charCount.toLocaleString("pt-BR")} / 4.000
                </span>
              </div>
            )}
          </div>

          {/* Smart Long-Input Inline Hint (>= 1500 chars) */}
          {showLongInputHint && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[var(--selo)]/30 bg-[var(--selo)]/10 text-xs animate-in fade-in duration-200">
              <span className="text-[var(--text-primary)] font-medium text-[11px] sm:text-xs">
                ✨ Texto longo detectado. Transformar em artefato antes de enviar?
              </span>
              <button
                type="button"
                onClick={() => setIsLongInputModalOpen(true)}
                className="px-3 py-1 rounded-lg bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:bg-[var(--nucleo)] transition-colors shrink-0 cursor-pointer shadow-xs"
              >
                Transformar
              </button>
            </div>
          )}
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

      {/* Smart Long-Input Modal */}
      <LongInputModal
        isOpen={isLongInputModalOpen}
        initialText={inputMessage}
        onClose={() => setIsLongInputModalOpen(false)}
        onConfirmTransform={handleConfirmTransform}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
