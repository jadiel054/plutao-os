"use client";

import { FormEvent, useState } from "react";

type Props = {
  missionId: string | null;
  missionObjective?: string;
};

type Message = { role: "user" | "assistant"; content: string };

export function CockpitAgentFab({ missionId, missionObjective }: Props) {
  const [open, setOpen] = useState(false);
  const [linked, setLinked] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          conversationId,
          missionId: linked ? missionId : null,
          stream: false,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error || "Não foi possível falar com o agente"));
      if (typeof data.conversationId === "string") setConversationId(data.conversationId);
      const answer = typeof data.message?.content === "string" ? data.message.content : "O agente não retornou uma resposta.";
      setMessages((current) => [...current, { role: "assistant", content: answer }]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Falha de comunicação com o agente";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 sm:right-6 sm:bottom-6">
      {open && (
        <section className="mb-3 flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-black/40" aria-label="Ajuda do agente no Cockpit">
          <header className="border-b border-[var(--border)] bg-[var(--base)]/80 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Ajuda do agente</p>
                <p className="text-[10px] text-[var(--text-muted)]">O Cockpit continua no controle da missão</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full px-2 py-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]" aria-label="Fechar ajuda">×</button>
            </div>
            {missionId && (
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[10px] text-[var(--text-secondary)]">
                <input type="checkbox" checked={linked} onChange={(event) => setLinked(event.target.checked)} className="mt-0.5 accent-[var(--selo)]" />
                <span><strong className="text-[var(--text-primary)]">Ajudar a missão aberta</strong><br />{missionObjective || "Contexto da missão selecionada"}</span>
              </label>
            )}
          </header>
          <div className="max-h-72 space-y-2 overflow-y-auto px-3 py-3" aria-live="polite">
            {messages.length === 0 && <p className="rounded-2xl bg-[var(--base)] px-3 py-2 text-xs text-[var(--text-muted)]">Pergunte sobre evidências, próximos passos ou uma decisão da operação.</p>}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${message.role === "user" ? "ml-auto bg-[var(--selo)] text-[var(--base)]" : "bg-[var(--base)] text-[var(--text-primary)]"}`}>
                {message.content}
              </div>
            ))}
            {busy && <p className="text-[10px] text-[var(--nucleo)]">Agente pensando…</p>}
            {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] text-red-300" role="alert">{error}</p>}
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-[var(--border)] p-3">
            <input value={input} onChange={(event) => setInput(event.target.value)} disabled={busy} placeholder="Fale com o agente…" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs outline-none focus:border-[var(--selo)]" aria-label="Mensagem para o agente" />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-[var(--selo)] px-3 py-2 text-xs font-semibold text-[var(--base)] transition-opacity disabled:opacity-40" aria-label="Enviar mensagem">↑</button>
          </form>
        </section>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} className="ml-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--selo)]/50 bg-[var(--selo)] text-2xl text-[var(--base)] shadow-xl shadow-black/30 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[var(--selo)] focus:ring-offset-2 focus:ring-offset-[var(--base)]" aria-label={open ? "Fechar ajuda do agente" : "Abrir ajuda do agente"} aria-expanded={open}>✦</button>
    </div>
  );
}
