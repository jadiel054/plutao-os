"use client";

import { useCallback, useEffect, useState } from "react";

type Grant = {
  id: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  status: "active" | "revoked";
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

type Props = {
  onNotify: (message: string, type?: "info" | "success" | "error" | "warning", title?: string) => void;
};

export function SettingsMcpGrantsSection({ onNotify }: Props) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/oauth/grants", { cache: "no-store" });
      if (!res.ok) {
        onNotify("Não foi possível carregar autorizações MCP", "error");
        return;
      }
      const data = await res.json();
      setGrants(Array.isArray(data.grants) ? data.grants : []);
    } catch {
      onNotify("Erro de rede ao listar grants MCP", "error");
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_id: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.revoked === false) {
        onNotify("Falha ao revogar autorização", "error");
        return;
      }
      onNotify("Autorização MCP revogada", "success");
      await load();
    } catch {
      onNotify("Erro ao revogar", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Agentes externos (MCP)</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Aplicativos que você autorizou a ler status, conectores e missões via MCP. Revogar
          invalida refresh tokens de imediato; access tokens expiram em até 1h.
        </p>
      </div>

      {loading ? (
        <p className="text-xs font-mono text-[var(--text-muted)]">Carregando…</p>
      ) : grants.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">Nenhuma autorização MCP ainda.</p>
      ) : (
        <ul className="space-y-3">
          {grants.map((g) => (
            <li
              key={g.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-3 text-xs space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="font-mono break-all">{g.clientId}</div>
                  <div className="text-[var(--text-muted)] break-all">{g.redirectUri}</div>
                  <div className="text-[var(--text-muted)]">
                    <span className="font-mono">{g.scope}</span>
                    {" · "}
                    {g.status === "active" ? (
                      <span className="text-emerald-500">ativo</span>
                    ) : (
                      <span className="text-red-400">revogado</span>
                    )}
                    {g.lastUsedAt
                      ? ` · uso ${new Date(g.lastUsedAt).toLocaleString("pt-BR")}`
                      : ""}
                  </div>
                </div>
                {g.status === "active" && (
                  <button
                    type="button"
                    disabled={busyId === g.id}
                    onClick={() => void revoke(g.id)}
                    className="shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-red-400 hover:bg-red-500/10 disabled:opacity-50 cursor-pointer"
                  >
                    {busyId === g.id ? "…" : "Revogar"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
