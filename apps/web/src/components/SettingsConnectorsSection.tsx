"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectorPublicView } from "@plutao/domain";
import type { ConnectorManifest } from "@/lib/connectors/manifests/types";

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
  const [manifests, setManifests] = useState<ConnectorManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [activeTokenProvider, setActiveTokenProvider] = useState<string | null>(null);
  const [inputToken, setInputToken] = useState("");
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
      if (Array.isArray(data.manifests)) {
        setManifests(data.manifests);
      }
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

  async function handleConnectOAuth(provider: string) {
    setBusy(provider);
    try {
      const res = await fetch(`/api/connectors/${provider}/authorize`, { method: "POST" });
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

  async function handleConnectToken(provider: string) {
    const token = inputToken.trim();
    if (token.length < 5) {
      onNotifyRef.current?.("Cole um Token / API Key válido", "error");
      return;
    }
    setBusy(`${provider}-token`);
    try {
      const res = await fetch(`/api/connectors/${provider}/connect-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotifyRef.current?.(typeof data.error === "string" ? data.error : "Falha ao conectar token", "error");
        return;
      }
      setInputToken("");
      setActiveTokenProvider(null);
      onNotifyRef.current?.(`Conector ${provider} conectado${data.accountLogin ? ` · @${data.accountLogin}` : ""}`, "success");
      await load();
    } catch {
      onNotifyRef.current?.("Erro de rede", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect(provider: string) {
    setBusy(`${provider}-disc`);
    try {
      const res = await fetch(`/api/connectors/${provider}/disconnect`, { method: "POST" });
      if (!res.ok) {
        onNotifyRef.current?.("Falha ao desconectar", "error");
        return;
      }
      onNotifyRef.current?.(`Conector ${provider} desconectado`, "success");
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

  // Combine user connector status with manifest catalog
  const connectorMap = new Map(connectors.map((c) => [c.provider, c]));

  // Group by category
  const categoriesMap = new Map<string, Array<{ manifest: ConnectorManifest; view?: ConnectorPublicView }>>();
  for (const m of manifests) {
    const categoryKey = m.category || "outros";
    if (!categoriesMap.has(categoryKey)) {
      categoriesMap.set(categoryKey, []);
    }
    categoriesMap.get(categoryKey)?.push({
      manifest: m,
      view: connectorMap.get(m.provider),
    });
  }

  // Sort categories: "desenvolvedores", "finanças", etc.
  const sortedCategoryKeys = Array.from(categoriesMap.keys()).sort((a, b) => {
    if (a === "desenvolvedores") return -1;
    if (b === "desenvolvedores") return 1;
    if (a === "finanças") return -1;
    if (b === "finanças") return 1;
    return a.localeCompare(b);
  });

  return (
    <section className="space-y-6 animate-in fade-in duration-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conectores</h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
            Plataforma declarativa de conectores oficiais. O Executor só opera o que estiver conectado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className="shrink-0 w-9 h-9 rounded-xl border border-[var(--border)] text-[var(--selo)] text-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
          aria-label="Adicionar conector customizado"
        >
          +
        </button>
      </div>

      {customOpen ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 space-y-3 bg-[var(--surface)]">
          <p className="text-xs font-semibold text-[var(--text-primary)]">Registrar Servidor MCP Personalizado</p>
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Nome (ex: Servidor MCP Interno)"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://mcp.exemplo.com"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm font-mono text-[var(--text-primary)]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold"
              onClick={() => {
                if (!customName.trim() || !customUrl.trim()) {
                  onNotifyRef.current?.("Nome e URL obrigatórios", "error");
                  return;
                }
                onNotifyRef.current?.(`Registrado: ${customName.trim()} (runtime MCP na próxima fatia)`, "info");
                setCustomOpen(false);
                setCustomName("");
                setCustomUrl("");
              }}
            >
              Registrar
            </button>
            <button
              type="button"
              onClick={() => setCustomOpen(false)}
              className="px-3 py-2 rounded-xl border border-[var(--border)] text-xs"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {inlineError ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          {inlineError}
        </div>
      ) : null}

      {sortedCategoryKeys.map((catKey) => {
        const items = categoriesMap.get(catKey) || [];
        if (items.length === 0) return null;

        const categoryTitle = catKey.charAt(0).toUpperCase() + catKey.slice(1);

        return (
          <div key={catKey} className="space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-2">
                {categoryTitle}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] font-normal">
                  {items.length} {items.length === 1 ? "conector" : "conectores"}
                </span>
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {items.map(({ manifest, view }) => {
                const status = view?.status ?? "disconnected";
                const isConnected = status === "connected";

                // Tool counter & modes
                const totalTools = manifest.capabilities.length;
                const hasWrite = manifest.capabilities.some((c) => c.mode === "write");
                const toolsSummaryText = `${totalTools} ${totalTools === 1 ? "ferramenta" : "ferramentas"} · ${
                  hasWrite ? "leitura e escrita" : "só leitura"
                }`;

                // Formatted connectedAt date
                const connectedDateStr = view?.connectedAt
                  ? new Date(view.connectedAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : null;

                const isTokenOpen = activeTokenProvider === manifest.provider;

                return (
                  <div
                    key={manifest.provider}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {manifest.displayName}
                          </p>
                          {manifest.featured ? (
                            <span className="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400">
                              Destaque
                            </span>
                          ) : null}
                          <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--base)]/60 px-2 py-0.5 rounded-md border border-[var(--border)]">
                            {toolsSummaryText}
                          </span>
                        </div>

                        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                          {manifest.description}
                        </p>

                        <div className="flex items-center gap-2 text-[11px] font-mono mt-1 text-[var(--text-secondary)] flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${
                              isConnected
                                ? "text-emerald-400"
                                : status === "error"
                                  ? "text-red-400"
                                  : "text-[var(--text-muted)]"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isConnected
                                  ? "bg-emerald-400"
                                  : status === "error"
                                    ? "bg-red-400"
                                    : "bg-neutral-500"
                              }`}
                            />
                            {STATUS_LABEL[status] ?? status}
                          </span>
                          {view?.accountLogin ? (
                            <span>· @{view.accountLogin}</span>
                          ) : view?.accountLabel ? (
                            <span>· {view.accountLabel}</span>
                          ) : null}
                          {connectedDateStr ? <span>· desde {connectedDateStr}</span> : null}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        {!isConnected ? (
                          manifest.authMode === "oauth" ? (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => void handleConnectOAuth(manifest.provider)}
                              className="px-3.5 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                            >
                              {busy === manifest.provider ? "Iniciando…" : "Conectar OAuth"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => {
                                setActiveTokenProvider((prev) =>
                                  prev === manifest.provider ? null : manifest.provider
                                );
                                setInputToken("");
                              }}
                              className="px-3.5 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                            >
                              Colar Token / Key
                            </button>
                          )
                        ) : (
                          <div className="flex items-center gap-2">
                            {manifest.authMode === "oauth" ? (
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => void handleConnectOAuth(manifest.provider)}
                                className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs hover:bg-[var(--surface-hover)] transition-colors"
                              >
                                Reconectar
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => {
                                  setActiveTokenProvider((prev) =>
                                    prev === manifest.provider ? null : manifest.provider
                                  );
                                  setInputToken("");
                                }}
                                className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs hover:bg-[var(--surface-hover)] transition-colors"
                              >
                                Atualizar Key
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => void handleDisconnect(manifest.provider)}
                              className="px-3 py-1.5 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs transition-colors"
                            >
                              Desconectar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {isTokenOpen ? (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--base)]/50 p-3 space-y-2.5 animate-in fade-in duration-150">
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {manifest.tokenConfig?.label || "Token / API Key"}: Obtenha em{" "}
                          {manifest.tokenConfig?.url ? (
                            <a
                              href={manifest.tokenConfig.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--selo)] underline font-medium"
                            >
                              {manifest.displayName} Console
                            </a>
                          ) : (
                            manifest.displayName
                          )}
                          . Armazenado com criptografia server-side.
                        </p>
                        <input
                          type="password"
                          autoComplete="off"
                          value={inputToken}
                          onChange={(e) => setInputToken(e.target.value)}
                          placeholder={manifest.tokenConfig?.placeholder || "Cole a API Key..."}
                          className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)]"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void handleConnectToken(manifest.provider)}
                            className="px-3 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:opacity-90 disabled:opacity-40"
                          >
                            {busy === `${manifest.provider}-token` ? "Validando..." : "Salvar e Conectar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTokenProvider(null);
                              setInputToken("");
                            }}
                            className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {/* Capability List with Mode Badges */}
                    {manifest.capabilities.length > 0 ? (
                      <div className="border-t border-[var(--border)] pt-3 space-y-2">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                          Ferramentas Disponíveis
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {manifest.capabilities.map((cap) => (
                            <div
                              key={cap.name}
                              className="rounded-xl border border-[var(--border)] bg-[var(--base)]/40 p-2.5 space-y-1 flex flex-col justify-between"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-mono font-medium text-[var(--selo)] truncate">
                                  {cap.name}
                                </span>
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold shrink-0 uppercase ${
                                    cap.mode === "write"
                                      ? "bg-amber-500/15 border border-amber-500/30 text-amber-400"
                                      : "bg-sky-500/15 border border-sky-500/30 text-sky-400"
                                  }`}
                                >
                                  {cap.mode === "write" ? "escrita" : "leitura"}
                                </span>
                              </div>
                              <p className="text-[10.5px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                                {cap.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
