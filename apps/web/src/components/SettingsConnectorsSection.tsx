"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const onNotifyRef = useRef(onNotify);
  useEffect(() => {
    onNotifyRef.current = onNotify;
  });

  const [connectors, setConnectors] = useState<ConnectorPublicView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [oauthReady, setOauthReady] = useState({ github: false, vercel: false, crypto: false });
  const [vercelToken, setVercelToken] = useState("");
  const [showVercelToken, setShowVercelToken] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/connectors", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503 || String(data.error).includes("Tabela de conectores")) {
          setInlineError(typeof data.error === "string" ? data.error : "Migration 0004 pendente.");
          return;
        }
        onNotifyRef.current?.(typeof data.error === "string" ? data.error : "Falha ao carregar", "error");
        return;
      }
      setInlineError(null);
      setConnectors(Array.isArray(data.connectors) ? data.connectors : []);
      setOauthReady({
        github: Boolean(data.oauth?.githubConfigured),
        vercel: Boolean(data.oauth?.vercelConfigured),
        crypto: Boolean(data.oauth?.tokenEncryptionReady),
      });
    } catch {
      onNotifyRef.current?.("Erro de rede", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const ok = url.searchParams.get("connector_ok");
    const err = url.searchParams.get("connector_error");
    if (!ok && !err) return;
    url.searchParams.delete("connector_ok");
    url.searchParams.delete("connector_error");
    window.history.replaceState(null, "", url.pathname + (url.search ? `?${url.searchParams}` : "") + url.hash);
    if (ok) {
      onNotifyRef.current?.(`Conector ${ok} conectado`, "success");
      void load();
    }
    if (err) onNotifyRef.current?.(decodeURIComponent(err), "error");
  }, [load]);

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
    } catch {
      onNotifyRef.current?.("Erro de rede", "error");
    } finally {
      setBusy(null);
    }
  }

  async function disconnectProvider(provider: "github" | "vercel") {
    setBusy(`${provider}-disc`);
    try {
      const res = await fetch(`/api/connectors/${provider}/disconnect`, { method: "POST" });
      if (!res.ok) return;
      onNotifyRef.current?.(`${provider === "github" ? "GitHub" : "Vercel"} desconectado`, "success");
      await load();
    } catch {
      onNotifyRef.current?.("Erro de rede", "error");
    } finally {
      setBusy(null);
    }
  }

  async function connectVercelToken() {
    const token = vercelToken.trim();
    if (token.length < 20) {
      onNotifyRef.current?.("Cole um Access Token válido", "error");
      return;
    }
    setBusy("vercel-token");
    try {
      const res = await fetch("/api/connectors/vercel/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotifyRef.current?.(typeof data.error === "string" ? data.error : "Falha Vercel", "error");
        return;
      }
      setVercelToken("");
      setShowVercelToken(false);
      onNotifyRef.current?.(`Vercel conectado${data.accountLogin ? ` · @${data.accountLogin}` : ""}`, "success");
      await load();
    } catch {
      onNotifyRef.current?.("Erro de rede", "error");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="text-xs text-[var(--text-muted)] font-mono">Carregando conectores…</p>;
  }

  return (
    <section className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conectores</h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
            Ligações oficiais. Executor só usa o que estiver conectado.
          </p>
        </div>
        <button type="button" onClick={() => setCustomOpen((v) => !v)} className="shrink-0 w-9 h-9 rounded-xl border border-[var(--border)] text-[var(--selo)] text-lg flex items-center justify-center" aria-label="Adicionar">+</button>
      </div>

      {customOpen ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 space-y-2">
          <button type="button" className="w-full text-left text-sm py-2" onClick={() => { setShowVercelToken(true); setCustomOpen(false); }}>Adicionar de Vercel</button>
          <button type="button" className="w-full text-left text-sm py-2" onClick={() => { setCustomOpen(false); void connectGitHub(); }}>Adicionar de GitHub</button>
          <div className="border-t border-[var(--border)] pt-2 space-y-2">
            <p className="text-[10px] text-[var(--text-muted)] uppercase font-mono">Personalizado (MCP)</p>
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Nome" className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm" />
            <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://mcp.exemplo.com" className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm font-mono" />
            <button type="button" className="px-3 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold" onClick={() => {
              if (!customName.trim() || !customUrl.trim()) { onNotifyRef.current?.("Nome e URL obrigatórios", "error"); return; }
              onNotifyRef.current?.(`Registrado: ${customName.trim()} (runtime MCP na próxima fatia)`, "info");
              setCustomOpen(false); setCustomName(""); setCustomUrl("");
            }}>Registrar</button>
          </div>
        </div>
      ) : null}

      {inlineError ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{inlineError}</div> : null}

      <div className="space-y-3">
        {connectors.map((c) => (
          <div key={c.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">{c.displayName}</p>
                <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">{STATUS_LABEL[c.status] ?? c.status}{c.accountLogin ? ` · @${c.accountLogin}` : ""}</p>
                {c.serverUrl ? <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1 truncate">{c.serverUrl}</p> : null}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {c.provider === "github" && c.status !== "connected" ? (
                  <button type="button" disabled={busy !== null || !oauthReady.github || !oauthReady.crypto} onClick={() => void connectGitHub()} className="px-3 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-[11px] font-semibold disabled:opacity-40">{busy === "github" ? "…" : "Conectar"}</button>
                ) : null}
                {c.provider === "github" && c.status === "connected" ? (
                  <>
                    <button type="button" disabled={busy !== null} onClick={() => void connectGitHub()} className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-[11px]">Reconectar</button>
                    <button type="button" disabled={busy !== null} onClick={() => void disconnectProvider("github")} className="px-3 py-1.5 rounded-xl border border-red-500/40 text-red-300 text-[11px]">Desconectar</button>
                  </>
                ) : null}
                {c.provider === "vercel" && c.status !== "connected" ? (
                  <button type="button" disabled={busy !== null || !oauthReady.crypto} onClick={() => setShowVercelToken(true)} className="px-3 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-[11px] font-semibold disabled:opacity-40">Conectar</button>
                ) : null}
                {c.provider === "vercel" && c.status === "connected" ? (
                  <>
                    <button type="button" disabled={busy !== null} onClick={() => setShowVercelToken(true)} className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-[11px]">Reconectar</button>
                    <button type="button" disabled={busy !== null} onClick={() => void disconnectProvider("vercel")} className="px-3 py-1.5 rounded-xl border border-red-500/40 text-red-300 text-[11px]">Desconectar</button>
                  </>
                ) : null}
              </div>
            </div>
            {c.provider === "vercel" && showVercelToken ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--base)]/40 p-3 space-y-2">
                <p className="text-[11px] text-[var(--text-muted)]">Token em <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer" className="text-[var(--selo)] underline">vercel.com/account/tokens</a>. Não cole no chat.</p>
                <input type="password" autoComplete="off" value={vercelToken} onChange={(e) => setVercelToken(e.target.value)} placeholder="Access Token" className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm font-mono" />
                <div className="flex gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => void connectVercelToken()} className="px-3 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-[11px] font-semibold disabled:opacity-40">{busy === "vercel-token" ? "Conectando…" : "Salvar e conectar"}</button>
                  <button type="button" onClick={() => { setShowVercelToken(false); setVercelToken(""); }} className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-[11px]">Cancelar</button>
                </div>
              </div>
            ) : null}
            {c.capabilities.length > 0 ? (
              <ul className="max-h-32 overflow-y-auto space-y-1">
                {c.capabilities.map((cap) => (
                  <li key={cap.name} className="text-[11px] font-mono text-[var(--text-secondary)] flex gap-2">
                    <span className="text-[var(--selo)]">{cap.name}</span>
                    {cap.description ? <span className="text-[var(--text-muted)] truncate">{cap.description}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
