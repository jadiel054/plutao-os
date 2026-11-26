"use client";

/**
 * NixVoiceAssist — assistência por voz livre durante o uso do sistema.
 *
 * Web Speech API (pt-BR) → POST /api/agentic/assist (núcleo agêntico) →
 * execução autorizada de navegação/toggles na própria página + resposta
 * falada. Compartilha o contexto da página atual; não é uma experiência
 * de voz isolada. Recusado silenciosamente em navegadores sem suporte.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { findSurface } from "@/lib/agentic/app-surface";

type AssistResponse = {
  command?: { intent?: string; utterance?: string; reply?: string; targetRoute?: string; controlId?: string; action?: string };
  interaction?: { allowed: boolean; reason?: string; control?: { testId?: string; label?: string } } | null;
};

export function NixVoiceAssist() {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => unknown;
      SpeechRecognition?: new () => unknown;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    setSupported(true);
    const rec = new Ctor() as {
      lang: string; interimResults: boolean; continuous: boolean;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onend: (() => void) | null;
      start: () => void; stop: () => void;
    };
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript.trim()) void handleUtterance(transcript.trim());
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speak = useCallback((text: string) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR";
      synth.cancel();
      synth.speak(u);
    } catch {
      /* speechSynthesis indisponível */
    }
  }, []);

  const handleUtterance = useCallback(async (text: string) => {
    try {
      const pageState: Record<string, unknown> = {};
      document.querySelectorAll<HTMLElement>("[data-testid]").forEach((el) => {
        const key = el.getAttribute("data-testid");
        if (!key) return;
        if (el instanceof HTMLInputElement && el.type === "checkbox") pageState[key] = el.checked;
      });
      const res = await fetch("/api/agentic/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, pageId: findSurface(window.location.pathname)?.id, pageState }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as AssistResponse;
      const reply = data.command?.reply ?? "";
      if (reply) {
        setLastReply(reply);
        speak(reply);
      }
      if (data.command?.targetRoute && data.command.intent === "navigate") {
        router.push(data.command.targetRoute);
        return;
      }
      if (data.command?.intent === "toggle_control" && data.interaction?.allowed && data.interaction.control?.testId) {
        const el = document.querySelector<HTMLElement>(`[data-testid="${data.interaction.control.testId}"]`);
        if (el) {
          el.click();
          // verificação pós-ação: devolve o novo estado ao núcleo
          await fetch("/api/agentic/assist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "estado após interação", pageId: findSurface(window.location.pathname)?.id, pageState: { ...pageState, [data.interaction.control.testId]: !(pageState[data.interaction.control.testId] as boolean) } }),
          });
        }
      }
    } catch {
      /* rede/parse — mantém silêncio, não interrompe o uso */
    }
  }, [router, speak]);

  if (!supported) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        type="button"
        data-testid="nix-voice-assist"
        aria-label={listening ? "Parar assistência por voz" : "Iniciar assistência por voz"}
        onClick={() => {
          if (listening) {
            recognitionRef.current?.stop();
            setListening(false);
          } else {
            try { recognitionRef.current?.start(); setListening(true); } catch { /* já ativo */ }
          }
        }}
        className="rounded-full bg-[var(--selo)]/15 px-4 py-2 text-sm text-[var(--fg)] shadow-sm hover:bg-[var(--selo)]/25"
      >
        {listening ? "Ouvindo…" : "Falar com a Nix"}
      </button>
      {lastReply ? (
        <p role="status" className="mt-2 max-w-xs rounded-lg bg-[var(--surface)] p-2 text-xs text-[var(--fg-muted)]">
          {lastReply}
        </p>
      ) : null}
    </div>
  );
}
