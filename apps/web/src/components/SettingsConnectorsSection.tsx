"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConnectorPublicView } from "@plutao/domain";

const STATUS_LABEL: Record<string, string> = {
  disconnected: "Desconectado",
  authorizing: "Autorizando…",
  connected: "Conectado",
  reconnecting: "Reconectando…",
  error: "Erro",
};

export function SettingsConnectorsSection({
  onNotify,
}: {
  onNotify?: (msg: string, type?: "info" | "success" | "error") => void;
}) {
  const [connectors, setConnectors] = useState<ConnectorPublicView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [oauthReady, setOauthReady] = useState<{ github: boolean; crypto: boolean }>({
    github: false,
    crypto: false,
  });

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
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("connector_ok");
    const err = params.get("connector_error");
    if (ok) {
      onNotify?.(`Conector ${ok} conectado`, "success");
      void load();
    }
    if (err) {
      onNotify?.(decodeURIComponent(err), "error");
    }
  }, [load, onNotify]);

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

  if (loading) {
    return (
      <p className="text-xs text-[var(--text-muted)] font-mono">Carregando conectores…</p>
    );
  }

  return (
    <section className="space-y-4 animate-in fade-in duration-200">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conectores</h2>
        <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
          Ligações externas com OAuth real. O Executor só usa ferramentas de conectores
          conectados. Estados: desconectado → autorizando → conectado → reconectar → erro.
        </p>
      </div>

      {!oauthReady.github || !oauthReady.crypto ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/90 space-y-1">
          {!oauthReady.github ? (
            <p>
              Configure <span className="font-mono">GITHUB_CLIENT_ID</span> e{" "}
              <span className="font-mono">GITHUB_CLIENT_SECRET</span> no ambiente de deploy.
              Callback: <span className="font-mono">/api/connectors/github/callback</span>
            </p>
          ) : null}
          {!oauthReady.crypto ? (
            <p>
              Configure <span className="font-mono">CONNECTOR_TOKEN_SECRET</span> ou{" "}
              <span className="font-mono">SESSION_SECRET</span> (≥16 caracteres) para cifrar
              tokens.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        {connectors.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">{c.displayName}</p>
                <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                  {STATUS_LABEL[c.status] ?? c.status}
                  {c.accountLogin ? ` · @${c.accountLogin}` : ""}
                </p>
                {c.serverUrl ? (
                  <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1 truncate">
                    {c.serverUrl}
                  </p>
                ) : null}
                {c.lastError ? (
                  <p className="text-[11px] text-red-300 mt-1">{c.lastError}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {c.provider === "github" && c.status !== "connected" ? (
                  <button
                    type="button"
                    disabled={busy !== null || !oauthReady.github || !oauthReady.crypto}
                    onClick={() => void connectGitHub()}
                    className="px-3 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-[11px] font-semibold disabled:opacity-40"
                  >
                    {busy === "github"
                      ? "Abrindo…"
                      : c.status === "error"
                        ? "Reconectar"
                        : "Conectar"}
                  </button>
                ) : null}
                {c.provider === "github" && c.status === "connected" ? (
                  <>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void connectGitHub()}
                      className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-[11px] text-[var(--text-secondary)] disabled:opacity-40"
                    >
                      Reconectar
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void disconnectGitHub()}
                      className="px-3 py-1.5 rounded-xl border border-red-500/40 text-red-300 text-[11px] disabled:opacity-40"
                    >
                      {busy === "github-disc" ? "…" : "Desconectar"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {c.capabilities.length > 0 ? (
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--text-muted)] mb-1.5">
                  Capacidades ({c.capabilities.length})
                </p>
                <ul className="max-h-36 overflow-y-auto space-y-1">
                  {c.capabilities.map((cap) => (
                    <li
                      key={cap.name}
                      className="text-[11px] text-[var(--text-secondary)] font-mono flex gap-2"
                    >
                      <span className="text-[var(--selo)] shrink-0">{cap.name}</span>
                      {cap.description ? (
                        <span className="text-[var(--text-muted)] truncate">
                          {cap.description}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : c.status === "connected" ? (
              <p className="text-[11px] text-[var(--text-muted)] italic">
                Nenhuma capacidade listada.
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
