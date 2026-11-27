"use client";

import { useCallback, useState } from "react";

type ConversationOption = { id: string; title?: string | null; updatedAt?: string | null };

/**
 * Ação "Vincular conversa" para missões sem conversa associada.
 * Lista conversas existentes do usuário (ownership garantido pela API de
 * listagem) e persiste via POST /api/missions/:id/link-conversation, que
 * revalida ownership no servidor. onLinked recarrega a visão sem reload.
 */
export function MissionLinkConversation({
  missionId,
  onLinked,
}: {
  missionId: string;
  onLinked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ConversationOption[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openList = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar conversas");
      const list = Array.isArray(data.conversations) ? data.conversations : [];
      setOptions(list.filter((c: ConversationOption) => c && typeof c.id === "string"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro de rede ao carregar conversas");
    } finally {
      setLoading(false);
    }
  }, []);

  const link = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/missions/" + missionId + "/link-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Falha ao vincular conversa");
      setOpen(false);
      onLinked();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro de rede ao vincular");
    } finally {
      setLoading(false);
    }
  }, [selected, missionId, onLinked]);

  return (
    <div className="space-y-2">
      {!open ? (
        <button
          type="button"
          onClick={() => void openList()}
          className="rounded-lg border border-[var(--selo)]/40 bg-[var(--selo)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--selo)] hover:bg-[var(--selo)]/20"
        >
          Vincular conversa
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--base)] p-3">
          <p className="text-[11px] text-[var(--text-secondary)]">
            Selecione uma conversa existente. A associação é validada no servidor;
            a troca de vínculo posterior não é permitida nesta etapa.
          </p>
          {loading ? (
            <p className="text-xs text-[var(--text-muted)] animate-pulse">Carregando conversas…</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">Nenhuma conversa existente encontrada.</p>
          ) : (
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs"
            >
              <option value="">Selecione…</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.title || "Sem título") + " · " + String(c.id).slice(0, 8)}
                </option>
              ))}
            </select>
          )}
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!selected || loading}
              onClick={() => void link()}
              className="rounded-lg bg-[var(--selo)] px-3 py-1.5 text-xs font-semibold text-[var(--base)] disabled:opacity-40"
            >
              {loading ? "Vinculando…" : "Confirmar vínculo"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
