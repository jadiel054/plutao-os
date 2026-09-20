"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ConnectorPublicView } from "@plutao/domain";

const STATUS_LABEL: Record<string, string> = {
  disconnected: "Desconectado",
  authorizing: "Autorizando…",
  connected: "Conectado",
  reconnecting: "Reconectando…",
  error: "Erro",
};

export function ConnectorsSheet({
  open,
  onClose,
  onNotify,
}: {
  open: boolean;
  onClose: () => void;
  onNotify?: (msg: string, type?: "info" | "success" | "error") => void;
}) {
  const onNotifyRef = useRef(onNotify);
  useEffect(() => {
    onNotifyRef.current = onNotify;
  });

  const [connectors, setConnectors] = useState<ConnectorPublicView[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [oauthReady, setOauthReady] = useState({ github: false, crypto: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const [vercelPanel, setVercelPanel] = useState(false);
  const [vercelToken, setVercelToken] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/connectors", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setConnectors(Array.isArray(data.connectors) ? data.connectors : []);
      setOauthReady({
        github: Boolean(data.oauth?.githubConfigured),
        crypto: Boolean(data.oauth?.tokenEncryptionReady),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function connectGitHub() {
    setBusy("github");
    try {
      const res = await fetch("/api/connectors/github/authorize", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotifyRef.current?.(typeof data.error === "string" ? data.error : "OAuth falhou", "error");
        return;
      }
      if (typeof data.authorizeUrl === "string") window.location.href = data.authorizeUrl;
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(provider: "github" | "vercel") {
    setBusy(provider);
    try {
      const res = await fetch(`/api/connectors/${provider}/disconnect`, { method: "POST" });
      if (!res.ok) return;
      onNotifyRef.current?.(`${provider} desconectado`, "success");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function connectVercelToken() {
    const token = vercelToken.trim();
    if (token.length < 20) {
      onNotifyRef.current?.("Token inválido", "error");
      return;
    }
    setBusy("vercel");
    try {
      const res = await fetch("/api/connectors/vercel/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotifyRef.current?.(typeof data.error === "string" ? data.error : "Falha", "error");
        return;
      }
      setVercelToken("");
      setVercelPanel(false);
      onNotifyRef.current?.(`Vercel conectado${data.accountLogin ? ` · @${data.accountLogin}` : ""}`, "success");
      await load();
    } finally {
      setBusy(null);
    }
  }

  function onToggle(c: ConnectorPublicView) {
    if (c.provider === "github") {
      if (c.status === "connected") void disconnect("github");
      else void connectGitHub();
      return;
    }
    if (c.provider === "vercel") {
      if (c.status === "connected") void disconnect("vercel");
      else setVercelPanel(true);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative z-10 rounded-t-3xl border border-[var(--border)] border-b-0 bg-[var(--surface)] px-4 pt-3 pb-8 max-h-[78dvh] overflow-y-auto shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]" />
        <div className="relative flex items-center justify-center mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conectores</h2>
          <button type="button" className="absolute right-0 text-[var(--selo)] text-xl w-8 h-8" onClick={() => setMenuOpen((v) => !v)} aria-label="Adicionar">+</button>
          {menuOpen ? (
            <div className="absolute right-0 top-9 z-20 w-56 rounded-2xl border border-[var(--border)] bg-[var(--base)] shadow-xl py-1 text-sm">
              <button type="button" className="w-full text-left px-4 py-2.5" onClick={() => { setMenuOpen(false); setVercelPanel(true); }}>Explorar / Vercel</button>
              <button type="button" className="w-full text-left px-4 py-2.5" onClick={() => { setMenuOpen(false); void connectGitHub(); }}>Adicionar de GitHub</button>
              <Link href="/configuracoes?tab=conectores" onClick={onClose} className="block px-4 py-2.5">Personalizado (MCP)</Link>
            </div>
          ) : null}
        </div>

        <div className="space-y-2 mb-4">
          <Link href="/configuracoes?tab=conectores" onClick={onClose} className="flex items-center gap-3 w-full rounded-2xl bg-[var(--base)]/80 border border-[var(--border)] px-4 py-3.5 text-sm">
            <span aria-hidden>⇄</span> Gerenciar Conectores
          </Link>
          <button type="button" onClick={() => setMenuOpen(true)} className="flex items-center gap-3 w-full rounded-2xl bg-[var(--base)]/80 border border-[var(--border)] px-4 py-3.5 text-sm">
            <span className="text-[var(--selo)]" aria-hidden>+</span> Adicionar conector
          </button>
        </div>

        {vercelPanel ? (
          <div className="mb-4 rounded-2xl border border-[var(--border)] p-4 space-y-3">
            <div className="flex justify-between">
              <p className="text-sm font-medium">Conectar Vercel</p>
              <button type="button" className="text-[11px] text-[var(--text-muted)]" onClick={() => setVercelPanel(false)}>Fechar</button>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Token em <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer" className="text-[var(--selo)] underline">account/tokens</a>. Campo oculto.
            </p>
            <input type="password" autoComplete="off" value={vercelToken} onChange={(e) => setVercelToken(e.target.value)} placeholder="Access Token" className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2.5 text-sm font-mono" />
            <button type="button" disabled={busy !== null || !oauthReady.crypto} onClick={() => void connectVercelToken()} className="w-full py-2.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-sm font-semibold disabled:opacity-40">
              {busy === "vercel" ? "Conectando…" : "Conectar"}
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="text-xs font-mono text-[var(--text-muted)] text-center py-4">Carregando…</p>
        ) : (
          <ul className="space-y-2">
            {connectors.map((c) => {
              const on = c.status === "connected";
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--base)]/60 border border-[var(--border)] px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-xl border border-[var(--border)] flex items-center justify-center text-xs font-bold shrink-0">
                      {c.provider === "github" ? "GH" : c.provider === "vercel" ? "VE" : "??"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.displayName}</p>
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
                    disabled={busy !== null}
                    onClick={() => onToggle(c)}
                    className={`relative w-11 h-6 rounded-full shrink-0 ${on ? "bg-[var(--selo)]" : "bg-[var(--border)]"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
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
