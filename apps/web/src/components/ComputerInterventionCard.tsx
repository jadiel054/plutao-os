"use client";

/**
 * FLUXO DE INTERVENÇÃO HUMANA do Computador do Plutão (Parte 2 da auditoria).
 *
 * O card aparece na MENSAGEM do Chat que pede a intervenção (última resposta
 * do agente com estado `waiting_human` durável). O usuário assume mouse e
 * teclado reais (CAS durável + fencing token) e faz login DIRETO no navegador
 * isolado — NUNCA colando senha no chat. "Devolver controle" abre diálogo com
 * texto OPCIONAL; ao confirmar: contexto persistido no checkpoint durável,
 * controle liberado com CAS durável, retomada automática da tarefa e a UI
 * volta ao Chat automaticamente (estilo Manus).
 */
import { useCallback, useEffect, useState } from "react";
import { RealComputerView } from "@/components/RealComputerView";
import {
  readInterventionStateFromEvents,
  type InterventionEventLike,
} from "@/lib/chat/computerFlowView";

type Props = {
  conversationId: string;
};

type ComputerStatusResponse = {
  controller?: string | null;
};

export function ComputerInterventionCard({ conversationId }: Props) {
  const [controller, setController] = useState<"agent" | "human" | "unknown" | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [instruction, setInstruction] = useState<string | null>(null);
  const [objective, setObjective] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const humanInControl = controller === "human";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/computer/${encodeURIComponent(conversationId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as ComputerStatusResponse;
        if (data.controller === "human" || data.controller === "agent" || data.controller === "unknown") {
          setController(data.controller);
        }
      }
    } catch {
      /* polling recupera */
    }
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/events?limit=30`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = (await res.json()) as { events?: InterventionEventLike[] };
        const view = readInterventionStateFromEvents(data.events ?? []);
        setWaiting(view.waiting);
        setReason(view.reason);
        setInstruction(view.instruction);
        setObjective(view.checkpoint?.objective || null);
        setNextAction(view.checkpoint?.nextAction || null);
      }
    } catch {
      /* polling recupera */
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(interval);
  }, [conversationId, refresh]);

  const takeover = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/computer/${encodeURIComponent(conversationId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "takeover" }),
      });
      if (res.ok) {
        const data = (await res.json()) as { controller?: string };
        if (data.controller) setController(data.controller as "agent" | "human");
        setExpanded(true);
      } else {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setFeedback(data.message ?? "não foi possível assumir o controle agora");
      }
    } catch {
      setFeedback("falha de rede ao assumir o controle");
    } finally {
      setBusy(false);
    }
  }, [conversationId]);

  const release = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/computer/${encodeURIComponent(conversationId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release", context: note.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        controller?: string;
        message?: string;
        resume?: { resumed?: boolean; reason?: string; browserNotice?: string };
      };
      if (res.ok) {
        if (data.controller) setController(data.controller as "agent" | "human");
        setDialogOpen(false);
        setNote("");
        // Volta ao Chat automaticamente: colapsa o computador no card.
        setExpanded(false);
        setFeedback(
          data.resume?.browserNotice
            ? data.resume.browserNotice
            : data.resume?.resumed
              ? "Tarefa retomada pelo agente — você está de volta ao Chat."
              : "Controle devolvido — o agente retoma na próxima mensagem."
        );
      } else {
        setFeedback(data.message ?? "não foi possível devolver o controle agora");
      }
    } catch {
      setFeedback("falha de rede ao devolver o controle");
    } finally {
      setBusy(false);
    }
  }, [conversationId, note]);

  if (!waiting && !expanded && !humanInControl) {
    return null;
  }

  return (
    <div className="mt-2 rounded-xl border border-[var(--selo)]/40 bg-[var(--surface)]/70 p-3 space-y-2"
      data-testid="computer-intervention-card"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-mono font-semibold text-[var(--selo)] uppercase">
          Computador do Plutão — intervenção humana
        </p>
        {humanInControl ? (
          <span className="text-[10px] font-mono text-[var(--text-muted)]">você está no controle</span>
        ) : null}
      </div>

      {waiting && reason ? <p className="text-xs text-[var(--text-primary)]">{reason}</p> : null}
      {objective ? (
        <p className="text-[10px] font-mono text-[var(--text-muted)]">
          Tarefa em andamento: {objective}
          {nextAction ? ` · próximo passo: ${nextAction}` : ""}
        </p>
      ) : null}
      {waiting && !humanInControl ? (
        <p className="text-[11px] text-[var(--text-secondary)]">
          {instruction ??
            "Faça a ação necessária DIRETO no navegador isolado. NUNCA cole senha e nem token no chat."}
        </p>
      ) : null}

      {!humanInControl ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void takeover()}
          className="px-3 py-1.5 rounded-lg bg-[var(--selo)] text-[var(--base)] text-xs font-semibold disabled:opacity-40"
          data-testid="intervention-takeover"
        >
          Assumir controle
        </button>
      ) : null}

      {expanded || humanInControl ? (
        <RealComputerView
          conversationId={conversationId}
          controller={humanInControl ? "human" : "agent"}
        />
      ) : null}

      {humanInControl ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setDialogOpen(true)}
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-semibold disabled:opacity-40"
          data-testid="intervention-release-open"
        >
          Devolver controle a Nix
        </button>
      ) : null}

      {dialogOpen ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/80 p-2.5 space-y-2" data-testid="intervention-dialog">
          <p className="text-[11px] text-[var(--text-secondary)]">
            O que você fez / o que o agente precisa saber? (opcional)
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Ex.: fiz o login com minha conta — siga a partir da tela de dashboard."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-xs text-[var(--text-primary)] outline-none"
            data-testid="intervention-note"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void release()}
              className="px-3 py-1.5 rounded-lg bg-[var(--selo)] text-[var(--base)] text-xs font-semibold disabled:opacity-40"
              data-testid="intervention-release-confirm"
            >
              Devolver e retomar tarefa
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDialogOpen(false)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-semibold disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <p className="text-[10px] font-mono text-[var(--text-muted)]" data-testid="intervention-feedback">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
