"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ConnectorPublicView } from "@plutao/domain";

const STATUS_LABEL: Record<string, string> = {
  disconnected: "Desconectado",
  authorizing: "Autorizando…",
  connected: "Conectado",
  reconnecting: "Reconectando…",
  error: "Erro",
};

/**
 * Sheet de acesso rápido a conectores (estilo painel inferior).
 * Gerenciar → Configurações; toggles conectam/desconectam no lugar.
 */
export function ConnectorsSheet({
  open,
  onClose,
  onNotify,
}: {
  open: boolean;
  onClose: () => void;
  onNotify?: (msg: string, type?: "info" | "success" | "error") => void;
}) {
  const [connectors, setConnectors] = useState<ConnectorPublicView[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [oauthReady, setOauthReady] = useState({ github: false, crypto: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/connectors", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify?.(
          typeof data.error === "string" ? data.error : "Falha ao carregar conectores",
          "error"
        );
        return;
      }
      setConnectors(Array.isArray(data.connectors) ? data.connectors : []);
      setOauthReady({
        github: Boolean(data.oauth?.githubConfigured),
        crypto: Boolean(data.oauth?.tokenEncryptionReady),
      });
    } catch {
      onNotify?.("Erro de rede ao carregar conectores", "error");
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function connectGitHub() {
    setBusy("github");
    try {
      const res = await fetch("/api/connectors/github/authorize", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify?.(
          typeof data.error === "string" ? data.error : "Não foi possível iniciar OAuth",
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
      onNotify?.("Erro de rede ao autorizar", "error");
    } finally {
      setBusy(null);
    }
  }

  async function disconnectGitHub() {
    setBusy("github-disc");
    try {
      const res = await fetch("/api/connectors/github/disconnect", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify?.(
          typeof data.error === "string" ? data.error : "Falha ao desconectar",
          "error"
        );
        return;
      }
      onNotify?.("GitHub desconectado", "success");
      await load();
    } catch {
      onNotify?.("Erro de rede ao desconectar", "error");
    } finally {
      setBusy(null);
    }
  }

  function onToggle(c: ConnectorPublicView) {
    if (c.provider !== "github") return;
    if (c.status === "connected") void disconnectGitHub();
    else void connectGitHub();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="relative z-10 rounded-t-3xl border border-[var(--border)] border-b-0 bg-[var(--surface)] px-4 pt-3 pb-8 max-h-[78dvh] overflow-y-auto shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]" />
        <h2 className="text-center text-sm font-semibold text-[var(--text-primary)] mb-4">
          Conectores
        </h2>

        <div className="space-y-2 mb-4">
          <Link
            href="/configuracoes?tab=conectores"
            onClick={onClose}
            className="flex items-center gap-3 w-full rounded-2xl bg-[var(--base)]/80 border border-[var(--border)] px-4 py-3.5 text-sm text-[var(--text-primary)] hover:border-[var(--selo)]/40 transition-colors"
          >
            <span className="text-[var(--text-muted)] text-base" aria-hidden>
              ⇄
            </span>
            <span>Gerenciar Conectores</span>
          </Link>
          <button
            type="button"
            disabled={busy !== null || !oauthReady.github || !oauthReady.crypto}
            onClick={() => void connectGitHub()}
            className="flex items-center gap-3 w-full rounded-2xl bg-[var(--base)]/80 border border-[var(--border)] px-4 py-3.5 text-sm text-[var(--text-primary)] hover:border-[var(--selo)]/40 transition-colors disabled:opacity-40"
          >
            <span className="text-[var(--selo)] text-lg leading-none" aria-hidden>
              +
            </span>
            <span>Adicionar conector</span>
          </button>
        </div>

        {!oauthReady.github || !oauthReady.crypto ? (
          <p className="text-[11px] text-amber-200/90 mb-3 leading-relaxed px-1">
            OAuth incompleto no ambiente. Abra Gerenciar Conectores para ver o que falta
            configurar.
          </p>
        ) : null}

        {loading ? (
          <p className="text-xs font-mono text-[var(--text-muted)] py-4 text-center">
            Carregando…
          </p>
        ) : (
          <ul className="space-y-2">
            {connectors.map((c) => {
              const on = c.status === "connected";
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--base)]/60 border border-[var(--border)] px-4 py-3"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <span
                      className="w-8 h-8 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-xs font-bold text-[var(--text-secondary)] shrink-0"
                      aria-hidden
                    >
                      {c.provider === "github" ? "GH" : String(c.provider).slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {c.displayName}
                      </p>
                      <p className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                        {STATUS_LABEL[c.status] ?? c.status}
                        {c.accountLogin ? ` · @${c.accountLogin}` : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    disabled={
                      busy !== null ||
                      (c.provider === "github" &&
                        !on &&
                        (!oauthReady.github || !oauthReady.crypto))
                    }
                    onClick={() => onToggle(c)}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 ${
                      on ? "bg-[var(--selo)]" : "bg-[var(--border)]"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        on ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
