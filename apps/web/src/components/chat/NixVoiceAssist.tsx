"use client";

/**
 * NixVoiceAssist — assistência por voz livre durante o uso do sistema.
 *
 * Web Speech API (pt-BR) → POST /api/agentic/assist (núcleo agêntico) →
 * execução autorizada de interações na própria página (InteractionExecutor
 * do cliente, sem coordenadas) + resposta falada. Compartilha o contexto da
 * página; não é uma experiência de voz isolada. Recusa em navegadores sem
 * suporte (componente não renderiza).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { findSurface } from "@/lib/agentic/app-surface";
import { findControl, type InteractionStep } from "@/lib/agentic/ui-perception";

type AssistResponse = {
  command?: { intent: string };
  response?: {
    reply?: string;
    intent?: string;
    navigateTo?: string;
    interaction?: { pageId: string; steps: InteractionStep[] };
  };
};

export function NixVoiceAssist() {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  const pageId = useCallback(
    () => findSurface(window.location.pathname)?.pageId ?? "chat",
    []
  );

  const snapshotState = useCallback(() => {
    const controls: Array<{ id: string; state?: string | boolean | number }> = [];
    document.querySelectorAll<HTMLInputElement>("[data-testid]").forEach((el) => {
      const id = el.getAttribute("data-testid");
      if (!id) return;
      if (el instanceof HTMLInputElement && el.type === "checkbox") controls.push({ id, state: el.checked });
    });
    return {
      pageId: pageId(),
      visibleText: (document.body.innerText ?? "").slice(0, 2000),
      controls,
    };
  }, [pageId]);

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

  const executeSteps = useCallback(
    async (page: string, steps: InteractionStep[]) => {
      for (const step of steps) {
        if (step.action.type === "toggle") {
          const control = findControl(page, step.action.control);
          const testId = control?.testId;
          const el = testId
            ? document.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)
            : null;
          if (!el) {
            return { ok: false, error: "controle não encontrado na página: " + step.action.control };
          }
          el.click();
        } else if (step.action.type === "navigate") {
          router.push(step.action.route);
        } else if (step.action.type === "click") {
          const control = findControl(page, step.action.control);
          const el = control?.testId
            ? document.querySelector<HTMLInputElement>(`[data-testid="${control.testId}"]`)
            : null;
          el?.click();
        }
      }
      return { ok: true as const };
    },
    [router]
  );

  const handleUtterance = useCallback(
    async (text: string) => {
      try {
        const res = await fetch("/api/agentic/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, pageId: pageId(), pageState: snapshotState() }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as AssistResponse;
        const reply = data.response?.reply ?? "";
        const intent = data.command?.intent;
        if (reply) {
          setLastReply(reply);
          speak(reply);
        }
        if (data.response?.navigateTo && intent === "navigate") {
          router.push(data.response.navigateTo);
          return;
        }
        const interaction = data.response?.interaction;
        if (interaction && interaction.steps.length > 0) {
          const sensitive = interaction.steps.some((s) => s.sensitive);
          if (sensitive) return; // exige confirmação humana; reply já pede confirmação
          const outcome = await executeSteps(interaction.pageId, interaction.steps);
          // Verificação pós-ação: devolve o novo snapshot ao núcleo.
          await fetch("/api/agentic/assist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: "verificação pós-ação",
              pageId: pageId(),
              pageState: snapshotState(),
            }),
          });
          if (!outcome.ok && outcome.error) {
            setLastReply(outcome.error);
            speak(outcome.error);
          }
        }
      } catch {
        /* rede/parse — não interrompe o uso */
      }
    },
    [executeSteps, pageId, router, snapshotState, speak]
  );

  useEffect(() => {
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => unknown;
      SpeechRecognition?: new () => unknown;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    setSupported(true);
    const rec = new Ctor() as {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
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
            try {
              recognitionRef.current?.start();
              setListening(true);
            } catch {
              /* já ativo */
            }
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
