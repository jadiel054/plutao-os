"use client";

/**
 * Fase 3 — NAVEGADOR REAL do Computador do Plutão dentro do Chat.
 *
 * Tela REAL do Chromium da sessão (SSE autenticado com frames de screencast
 * CDP) + mouse/teclado humanos REAIS (enviados ao Chromium da sessão pela
 * API do Plutão). Nada de token/endpoints do provedor: tudo via proxy.
 *
 * O preview de sandbox é OUTRO componente (srcDoc do HTML da conversa),
 * sempre rotulado "preview do app" — nunca é apresentado como computador
 * real. Ações críticas (encerrar) exigem confirmação.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { sendComputerInput } from "@/lib/computer/client";

export type ComputerViewStatus =
  | "offline"
  | "creating"
  | "ready"
  | "reconnecting"
  | "expired"
  | "closed"
  | "error";

const STATUS_LABELS: Record<ComputerViewStatus, string> = {
  offline: "sem sessão",
  creating: "conectando…",
  ready: "conectado",
  reconnecting: "reconectando…",
  expired: "expirada (plano Free: 2 min)",
  closed: "encerrada",
  error: "erro",
};

const FREE_LIMIT_HINT =
  "Plano gratuito do Browserless: sessões de até 2 minutos, 1 navegador por vez e ~8h de uso/mês. Reconectar abre um navegador novo (o estado segue no sandbox da conversa).";

type Props = {
  conversationId: string;
  controller: "agent" | "human";
};

export function RealComputerView({ conversationId, controller }: Props) {
  const [status, setStatus] = useState<ComputerViewStatus>("offline");
  const [error, setError] = useState<string | null>(null);
  const [frameSrc, setFrameSrc] = useState<string>("");
  const [sessionUnits, setSessionUnits] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const stopStream = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const startStream = useCallback(
    (id: string) => {
      stopStream();
      const es = new EventSource(
        `/api/computer/${encodeURIComponent(id)}/screen/stream`
      );
      esRef.current = es;
      es.addEventListener("frame", (msg) => {
        try {
          const data = JSON.parse((msg as MessageEvent).data) as { data?: string };
          if (data?.data) setFrameSrc(`data:image/jpeg;base64,${data.data}`);
        } catch {
          /* ignore frame corrompido */
        }
      });
      es.addEventListener("status", (msg) => {
        try {
          const data = JSON.parse((msg as MessageEvent).data) as {
            status?: ComputerViewStatus;
            error?: string | null;
          };
          if (data?.status) setStatus(data.status);
          if (data?.error !== undefined) setError(data.error);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener("bye", () => {
        es.close();
        if (esRef.current === es) esRef.current = null;
      });
      es.addEventListener("error", () => {
        es.close();
        if (esRef.current === es) esRef.current = null;
        // 404 = sessão inexistente/expirada; não reabre automaticamente.
      });
    },
    [stopStream]
  );

  const loadStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/computer/${encodeURIComponent(id)}/session`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        session?: {
          status?: ComputerViewStatus;
          error?: string | null;
          unitsUsed?: number;
          activeElsewhere?: boolean;
        };
      };
      if (data.session?.status) setStatus(data.session.status);
      setError(data.session?.error ?? null);
      setSessionUnits(typeof data.session?.unitsUsed === "number" ? data.session.unitsUsed : null);
      if (data.session?.status === "ready" && !esRef.current) startStream(id);
    } catch {
      /* ignore */
    }
  }, [startStream]);

  const startSession = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/computer/${encodeURIComponent(conversationId)}/session`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        session?: { status?: ComputerViewStatus; error?: string | null };
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setStatus("error");
        setError(data.message || data.error || "não foi possível conectar ao navegador remoto");
        return;
      }
      setStatus(data.session?.status ?? "creating");
      startStream(conversationId);
    } catch {
      setStatus("error");
      setError("falha de rede ao criar a sessão");
    } finally {
      setBusy(false);
    }
  }, [conversationId, startStream]);

  const closeSession = useCallback(async () => {
    if (!window.confirm("Encerrar a sessão do navegador real? O Chromium será fechado agora.")) return;
    setBusy(true);
    try {
      stopStream();
      await fetch(`/api/computer/${encodeURIComponent(conversationId)}/session`, {
        method: "DELETE",
      });
      setStatus("closed");
      setFrameSrc("");
    } catch {
      setError("falha de rede ao encerrar");
    } finally {
      setBusy(false);
    }
  }, [conversationId, stopStream]);

  const reconnectSession = useCallback(async () => {
    setBusy(true);
    try {
      stopStream();
      await fetch(`/api/computer/${encodeURIComponent(conversationId)}/session`, { method: "DELETE" });
      await startSession();
    } finally {
      setBusy(false);
    }
  }, [conversationId, startSession, stopStream]);

  useEffect(() => {
    if (!conversationId) return;
    void loadStatus(conversationId);
    const interval = window.setInterval(() => void loadStatus(conversationId), 5000);
    return () => {
      window.clearInterval(interval);
      stopStream();
    };
  }, [conversationId, loadStatus, stopStream]);

  // Input humano REAL: mapeado para o viewport do Chromium (1280×720).
  const screenRef = useRef<HTMLImageElement | null>(null);
  const handlePointer = useCallback(
    async (e: React.PointerEvent, type: "move" | "down" | "up" | "click") => {
      if (controller !== "human" || status !== "ready") return;
      const img = screenRef.current;
      if (!img || e.buttons > 0 && type === "move") return;
      const rect = img.getBoundingClientRect();
      const x = Math.round(((e.clientX - rect.left) / rect.width) * 1280);
      const y = Math.round(((e.clientY - rect.top) / rect.height) * 720);
      await sendComputerInput(conversationId, { kind: "mouse", type, x, y, button: "left", clickCount: 1 });
    },
    [conversationId, controller, status]
  );

  const handleKey = useCallback(
    async (e: React.KeyboardEvent) => {
      if (controller !== "human" || status !== "ready") return;
      e.preventDefault();
      const text =
        e.key === "Enter" ? "\r" :
        e.key === "Backspace" ? "\b" :
        e.key === "Tab" ? "\t" :
        e.key.length === 1 ? e.key : "";
      if (text) await sendComputerInput(conversationId, { kind: "key", type: "press", text });
    },
    [conversationId, controller, status]
  );

  const humanControlled = controller === "human";
  const active = status === "ready";

  return (
    <div className="rounded-xl border border-[var(--border)]/80 bg-[var(--base)]/40 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
          Navegador real · Chromium remoto · {STATUS_LABELS[status]}
        </p>
        {sessionUnits !== null && statusUnitsVisible(status) ? (
          <span className="text-[10px] font-mono text-[var(--text-muted)]">
            units usadas: {sessionUnits}
          </span>
        ) : null}
      </div>

      <p className="text-[10px] text-[var(--text-muted)]">
        Tela ao vivo do Chromium REAL via screencast (não é o preview do app).{" "}
        {status === "offline" ? FREE_LIMIT_HINT : ""}
      </p>

      {error ? (
        <p className="text-[11px] text-[var(--danger, #b91c1c)] font-mono">{error}</p>
      ) : null}

      {active && frameSrc ? (
        humanControlled ? (
          <>
            <img
              ref={screenRef}
            src={frameSrc}
            alt="Tela real do navegador da sessão"
            tabIndex={0}
            onPointerDown={(e) => void handlePointer(e, "down")}
            onPointerUp={(e) => void handlePointer(e, "up")}
            onPointerMove={(e) => void handlePointer(e, "move")}
            onKeyDown={(e) => void handleKey(e)}
            className="w-full rounded-lg border border-[var(--border)]/60 bg-white outline-none cursor-pointer"
              style={{ height: 280, objectFit: "contain", background: "#111" }}
            />
          </>
        ) : (
          <img
            src={frameSrc}
            alt="Tela real do navegador da sessão (agente no controle)"
            className="w-full rounded-lg border border-[var(--border)]/60"
            style={{ height: 280, objectFit: "contain", background: "#111" }}
          />
        )
      ) : status === "reconnecting" ? (
        <p className="text-[11px] font-mono text-[var(--text-muted)] py-8 text-center">
          reconectando ao navegador… (no plano Free isso abre um navegador novo)
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {!active && status !== "creating" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void startSession()}
            className="px-2.5 py-1 rounded-lg bg-[var(--selo)] text-[var(--base)] text-[11px] font-semibold disabled:opacity-40"
          >
            Iniciar navegador real
          </button>
        ) : null}
        {status === "reconnecting" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void reconnectSession()}
            className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[11px] font-semibold disabled:opacity-40"
          >
            Reconectar
          </button>
        ) : null}
        {active ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void closeSession()}
            className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[11px] font-semibold disabled:opacity-40"
          >
            Encerrar sessão
          </button>
        ) : null}
        {humanControlled && active ? (
          <span className="text-[10px] font-mono text-[var(--text-muted)]">
            clique na tela e digite — mouse/teclado reais vão para o Chromium
          </span>
        ) : null}
      </div>
    </div>
  );
}

function statusUnitsVisible(status: ComputerViewStatus): boolean {
  return status === "ready" || status === "creating";
}
