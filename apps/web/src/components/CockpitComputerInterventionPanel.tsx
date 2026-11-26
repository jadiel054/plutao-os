"use client";

/**
 * SUPERFÍCIE DE ORIGEM (auditoria de 2º nível): intervenções do Computador do
 * Plutão para missões/trabalho que COMEÇARAM NO COCKPIT são resolvidas AQUI,
 * no Cockpit — sem exigir navegação até o Chat. O estado durável é único
 * (conversation_events + computer_sessions); apenas a apresentação é
 * contextual. Missões iniciadas no Chat continuam com o card no Chat.
 */
import { useCallback, useEffect, useState } from "react";
import { ComputerInterventionCard } from "@/components/ComputerInterventionCard";

type PendingItem = {
  conversationId: string;
  state: string;
  controller: string;
  objective: string | null;
  nextAction: string | null;
  instruction: string | null;
  surface: "chat" | "cockpit";
  at: number | null;
};

export function CockpitComputerInterventionPanel() {
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/computer/pending", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { pending?: PendingItem[] };
        setPending(data.pending ?? []);
      }
    } catch {
      /* polling recupera */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  if (!loaded) return null;

  return (
    <section className="space-y-3" data-testid="cockpit-computer-interventions">
      <h2 className="text-sm font-semibold">
        Intervenções do Computador ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          Nenhuma intervenção pendente do Computador do Plutão.
        </p>
      ) : (
        pending.map((item) => (
          <div
            key={item.conversationId}
            className="rounded-xl border border-[var(--selo)]/40 bg-[var(--surface)] p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {item.objective ?? "Tarefa em andamento no computador"}
                </p>
                {item.nextAction ? (
                  <p className="text-[10px] font-mono text-[var(--text-muted)]">
                    próximo passo: {item.nextAction}
                  </p>
                ) : null}
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--selo)]">
                origem: Cockpit
              </span>
            </div>
            {/* Card completo de intervenção (takeover, tela real, devolução com
                checkpoint e retomada) — resolvido AQUI, sem trocar de tela. */}
            <ComputerInterventionCard conversationId={item.conversationId} />
          </div>
        ))
      )}
    </section>
  );
}
