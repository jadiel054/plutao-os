"use client";

import { useState } from "react";

type Props = {
  content: string;
  onRegenerate?: () => void;
  disabled?: boolean;
};

/**
 * Barra de ações sob a resposta do assistente — folha discreta (copiar, falar, regenerar, feedback).
 */
export function MessageActions({ content, onRegenerate, disabled }: Props) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [speaking, setSpeaking] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({ text: content });
      } else {
        await handleCopy();
      }
    } catch {
      /* user cancelled or unsupported */
    }
  }

  function handleSpeak() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(content.slice(0, 4000));
    u.lang = "pt-BR";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }

  const btn =
    "w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--base)]/80 transition-colors disabled:opacity-30";

  return (
    <div className="flex items-center gap-0.5 mt-1.5 -ml-1 opacity-80 hover:opacity-100 transition-opacity">
      <button type="button" className={btn} onClick={() => void handleCopy()} title={copied ? "Copiado" : "Copiar"} aria-label="Copiar">
        {copied ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" /></svg>
        )}
      </button>
      <button type="button" className={btn} onClick={() => void handleShare()} title="Compartilhar" aria-label="Compartilhar">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round" /></svg>
      </button>
      <button type="button" className={btn} onClick={handleSpeak} title={speaking ? "Parar" : "Ouvir"} aria-label="Ouvir">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinejoin="round" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" strokeLinecap="round" /></svg>
      </button>
      {onRegenerate ? (
        <button type="button" className={btn} disabled={disabled} onClick={onRegenerate} title="Regenerar" aria-label="Regenerar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      ) : null}
      <span className="w-px h-4 bg-[var(--border)] mx-1" aria-hidden />
      <button
        type="button"
        className={`${btn} ${feedback === "up" ? "text-[var(--selo)]" : ""}`}
        onClick={() => setFeedback((f) => (f === "up" ? null : "up"))}
        title="Útil"
        aria-label="Útil"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={feedback === "up" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75"><path d="M7 11v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0V8a4 4 0 0 1 4-4l1 5h5a2 2 0 0 1 2 2l-1 6a2 2 0 0 1-2 2h-7" strokeLinejoin="round" /></svg>
      </button>
      <button
        type="button"
        className={`${btn} ${feedback === "down" ? "text-rose-400" : ""}`}
        onClick={() => setFeedback((f) => (f === "down" ? null : "down"))}
        title="Não útil"
        aria-label="Não útil"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={feedback === "down" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75"><path d="M17 13V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3zm0 0v3a4 4 0 0 1-4 4l-1-5H7a2 2 0 0 1-2-2l1-6a2 2 0 0 1 2-2h7" strokeLinejoin="round" /></svg>
      </button>
    </div>
  );
}
