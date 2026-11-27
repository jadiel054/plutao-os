"use client";

/**
 * NixVoiceAssist — assistência por voz livre durante o uso do sistema.
 *
 * Web Speech API (pt-BR) → POST /api/agentic/assist (núcleo agêntico) →
 * execução autorizada de interações na própria página (InteractionExecutor
 * do cliente, sem coordenadas) + resposta falada. Compartilha o contexto da
 * página; não é uma experiência de voz isolada. Controles SENSÍVEIS exigem
 * confirmação falada explícita (confirmo/cancela). Recusa em navegadores sem
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

const CONFIRM_WORDS = ["confirmo", "confirma", "sim", "pode"];
const CANCEL_WORDS = ["cancela", "cancelar", "não", "nao", "desiste"];

type StepOutcome = { ok: boolean; observed?: string; error?: string };

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, text);
  else el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function findByTestId(testId: string): HTMLElement | null {
  return document.querySelector('[data-testid="' + testId + '"]');
}

export function NixVoiceAssist() {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const pendingRef = useRef<{ pageId: string; steps: InteractionStep[] } | null>(null);

  const pageId = useCallback(
    () => findSurface(window.location.pathname)?.pageId ?? "chat",
    []
  );

  const snapshotState = useCallback(() => {
    const controls: Array<{ id: string; state?: string | boolean | number }> = [];
    document.querySelectorAll<HTMLElement>("[data-testid]").forEach((el) => {
      const id = el.getAttribute("data-testid");
      if (!id) return;
      if (el instanceof HTMLInputElement && el.type === "checkbox") controls.push({ id, state: el.checked });
      else if (el instanceof HTMLInputElement && el.type === "text") controls.push({ id, state: el.value });
      else if (el instanceof HTMLSelectElement) controls.push({ id, state: el.value });
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
    async (page: string, steps: InteractionStep[]): Promise<StepOutcome> => {
      for (const step of steps) {
        const action = step.action;
        if (action.type === "navigate") {
          router.push(action.route);
          continue;
        }
        const control = findControl(page, action.control);
        if (!control?.testId) {
          return { ok: false, error: "controle sem seletor semântico: " + action.control };
        }
        const el = findByTestId(control.testId);
        if (!el) {
          return { ok: false, error: "controle não encontrado na página: " + action.control };
        }
        if (action.type === "click") {
          el.click();
        } else if (action.type === "toggle") {
          if (el instanceof HTMLInputElement && el.type === "checkbox") {
            if (el.checked !== action.to) el.click();
          } else {
            (el as HTMLElement).click();
          }
        } else if (action.type === "type") {
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            setInputValue(el, action.text);
          } else if (el instanceof HTMLSelectElement) {
            const option = [...el.options].find(
              (o) => o.value === action.text || o.text.toLowerCase() === action.text.toLowerCase()
            );
            if (!option) {
              return { ok: false, error: "opção não encontrada no select: " + action.text };
            }
            el.value = option.value;
            el.dispatchEvent(new Event("change", { bubbles: true }));
          } else {
            return { ok: false, error: "controle não aceita digitação: " + action.control };
          }
        } else {
          return { ok: false, error: "ação não suportada pelo executor do cliente" };
        }
      }
      return { ok: true, observed: "interação executada" };
    },
    [router]
  );

  const verifyAfterAction = useCallback(async () => {
    try {
      await fetch("/api/agentic/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "verificação pós-ação",
          pageId: pageId(),
          pageState: snapshotState(),
        }),
      });
    } catch {
      /* verificação best-effort */
    }
  }, [pageId, snapshotState]);

  const runInteraction = useCallback(
    async (interaction: { pageId: string; steps: InteractionStep[] }) => {
      const outcome = await executeSteps(interaction.pageId, interaction.steps);
      await verifyAfterAction();
      if (!outcome.ok && outcome.error) {
        setLastReply(outcome.error);
        speak(outcome.error);
      } else if (outcome.ok) {
        setLastReply("Interação concluída.");
        speak("Interação concluída.");
      }
    },
    [executeSteps, speak, verifyAfterAction]
  );

  const handleUtterance = useCallback(
    async (text: string) => {
      try {
        // Confirmação falada de controle sensível pendente.
        const pending = pendingRef.current;
        if (pending) {
          const t = text.toLowerCase().trim();
          if (CANCEL_WORDS.some((w) => t === w || t.startsWith(w))) {
            pendingRef.current = null;
            const msg = "Ação cancelada.";
            setLastReply(msg);
            speak(msg);
            return;
          }
          if (CONFIRM_WORDS.some((w) => t === w || t.startsWith(w))) {
            pendingRef.current = null;
            await runInteraction(pending);
            return;
          }
        }

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
          if (sensitive) {
            // Guarda o plano e aguarda confirmação falada explícita.
            pendingRef.current = interaction;
            return;
          }
          await runInteraction(interaction);
        }
      } catch {
        /* rede/parse — não interrompe o uso */
      }
    },
    [pageId, router, runInteraction, snapshotState, speak]
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
