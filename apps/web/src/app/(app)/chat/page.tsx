"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
        setError(data.error ?? "Falha ao enviar mensagem");
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
      setError("Erro de rede ao enviar mensagem ao agente");
    } finally {
      setSending(false);
    }
  }

  function handleQuickPrompt(prompt: string) {
    setInputMessage(prompt);
  }

  function clearHistory() {
    setMessages([]);
    if (userEmail) {
      localStorage.removeItem(`plutao_chat_${userEmail}`);
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-[var(--text-muted)] text-sm font-mono">
        Carregando Chat Plutão…
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--base)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto max-w-4xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--selo)] text-[var(--base)] font-bold flex items-center justify-center text-sm shadow-sm">
              P
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-sm tracking-tight">{agentName}</h1>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Agente On-line" />
              </div>
              <p className="text-[11px] text-[var(--text-muted)] truncate max-w-[200px] sm:max-w-xs">
                {agentIdentity}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            <Link
              href="/cockpit"
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--base)] hover:border-[var(--selo)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Cockpit
            </Link>
            <button
              type="button"
              onClick={() => void fetch("/api/auth/logout", { method: "POST" }).then(() => router.replace("/login"))}
              className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Chat Content */}
      <main className="flex-1 mx-auto max-w-4xl w-full flex flex-col p-4 overflow-hidden">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-2xl shadow-inner">
              🤖
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="text-xl font-semibold tracking-tight">Conversar com {agentName}</h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {agentIdentity}. Digite uma mensagem ou selecione uma sugestão rápida abaixo para começar.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full pt-4">
              <button
                type="button"
                onClick={() => handleQuickPrompt("Qual é o status das minhas missões atuais?")}
                className="p-3 text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--selo)] transition-all text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] space-y-1"
              >
                <div className="font-medium text-[var(--text-primary)]">📊 Status de Missões</div>
                <div className="text-[11px] text-[var(--text-muted)]">Perguntar sobre o progresso atual</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt("Me ajude a planejar uma nova missão.")}
                className="p-3 text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--selo)] transition-all text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] space-y-1"
              >
                <div className="font-medium text-[var(--text-primary)]">🎯 Planejar Nova Missão</div>
                <div className="text-[11px] text-[var(--text-muted)]">Definir objetivos e passos</div>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
            <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] border-b border-[var(--border)]/40 pb-2">
              <span>Histórico de conversa</span>
              <button
                type="button"
                onClick={clearHistory}
                className="hover:text-[var(--danger)] transition-colors"
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
          <div className="mb-3 p-3 rounded-lg border border-[var(--danger)]/50 bg-[var(--danger)]/10 text-[var(--danger)] text-xs flex justify-between items-center">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-bold px-1"
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
              className="px-4 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-medium hover:bg-[var(--nucleo)] disabled:opacity-40 disabled:hover:bg-[var(--selo)] transition-colors shrink-0"
            >
              Enviar
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
