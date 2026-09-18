"use client";

import { useState } from "react";

export type SuggestedConnector = {
  provider: string;
  displayName: string;
  status: string;
  reason?: string;
};

const STATUS_LABEL: Record<string, string> = {
  disconnected: "Não conectado",
  authorizing: "Autorizando…",
  connected: "Conectado",
  reconnecting: "Reconectando…",
  error: "Erro",
};

/**
 * Card de ação no fio do chat: conector necessário mas indisponível.
 * Conectar inicia OAuth; Pular dispensa nesta conversa.
 */
export function ConnectorActionCard({
  items,
  onDismiss,
  onNotify,
  onOpenManage,
}: {
  items: SuggestedConnector[];
  onDismiss: () => void;
  onNotify?: (msg: string, type?: "info" | "success" | "error") => void;
  onOpenManage?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function connect(provider: string) {
    if (provider !== "github") {
      onNotify?.("Este conector ainda não tem OAuth no produto.", "info");
      onOpenManage?.();
      return;
    }
    setBusy(provider);
    try {
      const res = await fetch("/api/connectors/github/authorize", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify?.(
          typeof data.error === "string" ? data.error : "Não foi possível iniciar a conexão",
          "error"
        );
        return;
      }
      if (typeof data.authorizeUrl === "string") {
        window.location.href = data.authorizeUrl;
        return;
      }
      onNotify?.("URL de autorização ausente", "error");
    } catch {
      onNotify?.("Erro de rede ao conectar", "error");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-3 max-w-[85%]">
      <div className="text-[11px] font-medium text-[var(--text-primary)]">
        Ação sugerida
      </div>
      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        Para seguir com o que você pediu, é preciso ativar a integração abaixo. Nada é
        conectado sem a sua confirmação.
      </p>
      <ul className="space-y-2">
        {items.map((c) => (
          <li
            key={c.provider}
            className="rounded-xl border border-[var(--border)] bg-[var(--base)]/70 px-3 py-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-8 h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[10px] font-bold text-[var(--text-secondary)] shrink-0"
                  aria-hidden
                >
                  {c.provider === "github" ? "GH" : c.provider.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {c.displayName}
                  </p>
                  <p className="text-[10px] font-mono text-[var(--text-muted)]">
                    {STATUS_LABEL[c.status] ?? c.status}
                  </p>
                </div>
              </div>
            </div>
            {c.reason ? (
              <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">{c.reason}</p>
            ) : null}
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void connect(c.provider)}
                className="w-full py-2.5 rounded-xl bg-[var(--papel)] text-[var(--base)] text-sm font-semibold disabled:opacity-40 hover:opacity-95 transition-opacity"
              >
                {busy === c.provider ? "Abrindo autorização…" : "Conectar"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={onDismiss}
                className="w-full py-2 rounded-xl bg-[var(--base)] border border-[var(--border)] text-sm text-[var(--text-secondary)] disabled:opacity-40"
              >
                Pular
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onOpenManage}
        className="text-[10px] text-[var(--text-muted)] hover:text-[var(--selo)] transition-colors"
      >
        Preferir outra integração? Ver todos os conectores
      </button>
    </div>
  );
}
