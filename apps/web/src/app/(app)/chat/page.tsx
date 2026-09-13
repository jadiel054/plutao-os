"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatFileSize } from "@/lib/artifacts";

const LONG_INPUT_THRESHOLD = 1500;
const MAX_CHAR_LIMIT = 4000;

type AttachedArtifact = {
  id: string;
  name: string;
  type: string;
  size: number;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  artifacts?: AttachedArtifact[];
};

export default function ChatPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [agentName, setAgentName] = useState("Plutão");
  const [agentIdentity, setAgentIdentity] = useState("Assistente Pessoal Autônomo");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [pendingArtifacts, setPendingArtifacts] = useState<AttachedArtifact[]>([]);
  const [convertingArtifact, setConvertingArtifact] = useState(false);
  const [showExpandedModal, setShowExpandedModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalTextareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  // Auto-resize textarea height as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
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

  async function handleConvertToArtifact() {
    if (!inputMessage.trim() || convertingArtifact) return;

    setConvertingArtifact(true);
    setError(null);

    try {
      const res = await fetch("/api/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: inputMessage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao converter texto em artifact");
        return;
      }

      if (data.artifact) {
        const newArt: AttachedArtifact = {
          id: data.artifact.id,
          name: data.artifact.name,
          type: data.artifact.type,
          size: data.artifact.size,
        };
        setPendingArtifacts((prev) => [...prev, newArt]);
        setInputMessage("");
        setShowExpandedModal(false);
      }
    } catch {
      setError("Erro ao se comunicar com servidor para criar artifact");
    } finally {
      setConvertingArtifact(false);
    }
  }

  async function handleSend(e?: FormEvent) {
    if (e) e.preventDefault();
    const text = inputMessage.trim();
    if ((!text && pendingArtifacts.length === 0) || sending) return;

    if (text.length > MAX_CHAR_LIMIT) {
      setError(`A mensagem excede o limite máximo de ${MAX_CHAR_LIMIT.toLocaleString()} caracteres.`);
      return;
    }

    setError(null);
    const activeArtifacts = [...pendingArtifacts];
    const displayContent =
      text || (activeArtifacts.length > 0 ? `[Arquivo anexado: ${activeArtifacts.map((a) => a.name).join(", ")}]` : "");

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayContent,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      artifacts: activeArtifacts.length > 0 ? activeArtifacts : undefined,
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
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

  const isLongInput = inputMessage.length >= LONG_INPUT_THRESHOLD;
  const isOverLimit = inputMessage.length > MAX_CHAR_LIMIT;

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

                  {/* Visual Compact Artifact Chip inside message */}
                  {m.artifacts && m.artifacts.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-[var(--base)]/20 flex flex-wrap gap-1.5">
                      {m.artifacts.map((art) => (
                        <div
                          key={art.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono tracking-tight ${
                            m.role === "user"
                              ? "bg-[var(--base)]/20 text-[var(--base)]"
                              : "bg-[var(--base)] border border-[var(--border)] text-[var(--text-primary)]"
                          }`}
                        >
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className="font-semibold truncate max-w-[160px]">{art.name}</span>
                          <span className="opacity-75 text-[10px]">({formatFileSize(art.size)})</span>
                        </div>
                      ))}
                    </div>
                  )}

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

        {/* Input Bar — Auto-Expanding Modern Composer */}
        <form onSubmit={handleSend} className="pt-2 sticky bottom-0 bg-[var(--base)] space-y-2">
          {/* Smart Long-Input Detection Action Banner */}
          {isLongInput && (
            <div className="p-2.5 rounded-xl border border-[var(--selo)]/50 bg-[var(--surface)] flex flex-wrap items-center justify-between gap-2 text-xs shadow-sm">
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <svg className="w-4 h-4 text-[var(--selo)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Texto longo detectado ({inputMessage.length.toLocaleString()} caracteres).</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowExpandedModal(true)}
                  className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs transition-colors"
                >
                  Expandir editor
                </button>
                <button
                  type="button"
                  onClick={handleConvertToArtifact}
                  disabled={convertingArtifact}
                  className="px-3 py-1 rounded-lg bg-[var(--selo)] text-[var(--base)] text-xs font-medium hover:bg-[var(--nucleo)] transition-colors shrink-0 disabled:opacity-50"
                >
                  {convertingArtifact ? "Convertendo…" : "Transformar em arquivo"}
                </button>
              </div>
            </div>
          )}

          {/* Pending Attached Artifact Cards */}
          {pendingArtifacts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingArtifacts.map((art) => (
                <div
                  key={art.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text-primary)] shadow-sm"
                >
                  <svg className="w-3.5 h-3.5 text-[var(--selo)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium truncate max-w-[150px]">{art.name}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">{formatFileSize(art.size)}</span>
                  <button
                    type="button"
                    onClick={() => setPendingArtifacts((prev) => prev.filter((a) => a.id !== art.id))}
                    className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors text-xs font-bold ml-1"
                    title="Remover anexo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Auto-expanding Textarea Container */}
          <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--selo)] transition-all p-2 flex flex-col gap-1.5 shadow-sm">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              enterKeyHint="send"
              placeholder={
                pendingArtifacts.length > 0
                  ? "Adicionar instrução curta sobre o arquivo anexado…"
                  : `Enviar mensagem para ${agentName}… (Shift+Enter para nova linha)`
              }
              disabled={sending || convertingArtifact}
              className="w-full bg-transparent px-2 py-1 text-base sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none resize-none min-h-[40px] max-h-[180px] overflow-y-auto disabled:opacity-50 leading-relaxed"
            />

            <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]/40 px-1">
              {/* Discrete character count indicator */}
              <div className="text-[10px] font-mono">
                {inputMessage.length >= 1000 ? (
                  <span
                    className={
                      isOverLimit
                        ? "text-[var(--danger)] font-bold"
                        : inputMessage.length >= 3500
                        ? "text-amber-400 font-semibold"
                        : "text-[var(--text-muted)]"
                    }
                  >
                    {inputMessage.length.toLocaleString()} / {MAX_CHAR_LIMIT.toLocaleString()} chars
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)]/50">Enter enviar · Shift+Enter nova linha</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isLongInput && (
                  <button
                    type="button"
                    onClick={() => setShowExpandedModal(true)}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Modal Fullscreen
                  </button>
                )}
                <button
                  type="submit"
                  disabled={sending || convertingArtifact || isOverLimit || (!inputMessage.trim() && pendingArtifacts.length === 0)}
                  className="px-4 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:bg-[var(--nucleo)] disabled:opacity-40 disabled:hover:bg-[var(--selo)] transition-colors shrink-0"
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Fullscreen Expanded Editor Modal */}
        {showExpandedModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--base)]">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-[var(--selo)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <h3 className="font-semibold text-sm">Editor de Texto Longo</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {inputMessage.length.toLocaleString()} caracteres
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowExpandedModal(false)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex-1 p-4 bg-[var(--base)]">
                <textarea
                  ref={modalTextareaRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Cole ou digite seu texto longo aqui…"
                  className="w-full h-full bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none resize-none leading-relaxed font-mono"
                />
              </div>

              <div className="p-4 border-t border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowExpandedModal(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--base)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Voltar ao Chat
                </button>
                <button
                  type="button"
                  onClick={handleConvertToArtifact}
                  disabled={convertingArtifact || !inputMessage.trim()}
                  className="px-5 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:bg-[var(--nucleo)] disabled:opacity-40 transition-colors"
                >
                  {convertingArtifact ? "Convertendo…" : "Transformar em Arquivo"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
