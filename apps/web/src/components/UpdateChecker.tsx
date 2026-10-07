"use client";

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { useEffect, useMemo, useState } from "react";

type Release = {
  versionCode: number;
  versionName: string;
  notes: string;
  date: string;
  size: number;
  sha256: string;
};

type Manifest = {
  latest: Release | null;
  minSupported: number;
};

const CACHE_KEY = "plutao:update-check:v3";
const DISMISSED_PREFIX = "plutao:update-dismissed:v2:";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "tamanho não informado";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "release oficial"
    : `publicado em ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
}

function safeManifest(value: unknown): Manifest | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Manifest>;
  const latest = candidate.latest;
  if (!latest || typeof latest !== "object") return { latest: null, minSupported: Number(candidate.minSupported) || 1 };
  if (typeof latest.versionName !== "string" || !Number.isFinite(Number(latest.versionCode))) return null;
  return {
    minSupported: Number.isFinite(Number(candidate.minSupported)) ? Number(candidate.minSupported) : 1,
    latest: {
      versionCode: Number(latest.versionCode),
      versionName: latest.versionName,
      notes: typeof latest.notes === "string" ? latest.notes : "Melhorias de estabilidade e experiência.",
      date: typeof latest.date === "string" ? latest.date : "",
      size: Number(latest.size) || 0,
      sha256: typeof latest.sha256 === "string" ? latest.sha256 : "",
    },
  };
}

export function UpdateChecker() {
  const [update, setUpdate] = useState<Release | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("");
  const [opening, setOpening] = useState<"download" | "center" | null>(null);
  const [actionError, setActionError] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    const check = async () => {
      try {
        const info = await App.getInfo();
        const currentCode = Number.parseInt(info.build, 10) || 0;
        if (active) setCurrentVersion(info.version || `build ${currentCode}`);

        let manifest: Manifest | null = null;
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw) as { checkedAt?: number; manifest?: unknown };
            if (typeof cached.checkedAt === "number" && Date.now() - cached.checkedAt < CHECK_INTERVAL_MS) {
              manifest = safeManifest(cached.manifest);
            }
          } catch {
            localStorage.removeItem(CACHE_KEY);
          }
        }
        if (!manifest) {
          const response = await fetch("/api/updates/manifest.json", { cache: "no-store" });
          if (!response.ok) return;
          manifest = safeManifest(await response.json());
          if (manifest) localStorage.setItem(CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), manifest }));
        }
        if (!active || !manifest) return;
        if (currentCode < manifest.minSupported) {
          setBlocked(true);
          setUpdate(manifest.latest);
          return;
        }
        if (manifest.latest && currentCode < manifest.latest.versionCode) {
          const dismissed = localStorage.getItem(`${DISMISSED_PREFIX}${manifest.latest.versionCode}`) === "1";
          if (!dismissed) setUpdate(manifest.latest);
        }
      } catch {
        // A failed advisory check must never prevent the APK from starting.
      }
    };
    void check();
    return () => { active = false; };
  }, []);

  const downloadUrl = useMemo(
    () => update ? `/api/updates/download/${encodeURIComponent(update.versionName)}` : "/download",
    [update],
  );

  if (!update && !blocked) return null;

  async function open(url: string, kind: "download" | "center") {
    setOpening(kind);
    setActionError(false);
    try {
      const absoluteUrl = typeof window !== "undefined" ? new URL(url, window.location.origin).toString() : url;
      if (Capacitor.isNativePlatform()) await Browser.open({ url: absoluteUrl, presentationStyle: "popover" });
      else window.location.assign(url);
    } catch {
      setActionError(true);
    } finally {
      setOpening(null);
    }
  }

  function dismiss() {
    if (update) localStorage.setItem(`${DISMISSED_PREFIX}${update.versionCode}`, "1");
    setUpdate(null);
  }

  return (
    <div
      className="update-card fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md overflow-hidden rounded-[1.5rem] border border-[var(--selo)]/35 bg-[var(--surface-elevated)]/95 shadow-[0_20px_70px_rgba(0,0,0,.45)] backdrop-blur-xl sm:inset-x-auto sm:right-5 sm:left-auto"
      role={blocked ? "alertdialog" : "status"}
      aria-live="polite"
      aria-modal={blocked || undefined}
    >
      <div className="h-1 bg-gradient-to-r from-[var(--selo)] via-[var(--nucleo)] to-transparent" />
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--selo)]/30 bg-[var(--selo)]/12 text-[var(--selo)]" aria-hidden>
              ↓
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--selo)]">
                {blocked ? "Atualização necessária" : "Nova versão disponível"}
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold text-[var(--text-primary)]">
                Plutão {update?.versionName}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                versão atual {currentVersion || "instalada"}
              </p>
            </div>
          </div>
          {!blocked && (
            <button type="button" onClick={dismiss} className="rounded-xl p-1.5 text-xl leading-none text-[var(--text-muted)] transition hover:bg-[var(--base)] hover:text-[var(--text-primary)]" aria-label="Lembrar depois">
              ×
            </button>
          )}
        </div>

        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          {blocked
            ? "Esta versão deixou de ser suportada. Atualize agora para continuar usando o Plutão com segurança."
            : update?.notes || "Uma nova versão do Plutão está pronta para você."}
        </p>

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--base)]/45 p-3 text-[11px]">
          <div><span className="block text-[var(--text-muted)]">Pacote</span><strong className="mt-1 block text-[var(--text-primary)]">APK oficial</strong></div>
          <div><span className="block text-[var(--text-muted)]">Tamanho</span><strong className="mt-1 block text-[var(--text-primary)]">{formatSize(update?.size ?? 0)}</strong></div>
          <div className="col-span-2"><span className="block text-[var(--text-muted)]">Disponibilidade</span><strong className="mt-1 block text-[var(--text-primary)]">{formatDate(update?.date ?? "")}</strong></div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" disabled={opening !== null} onClick={() => void open(downloadUrl, "download")} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[var(--selo)] px-4 text-sm font-semibold text-[var(--base)] transition hover:bg-[var(--nucleo)] disabled:cursor-wait disabled:opacity-60">
            {opening === "download" ? "Abrindo download…" : blocked ? "Baixar atualização" : "Atualizar agora"}
          </button>
          <button type="button" disabled={opening !== null} onClick={() => void open("/download", "center")} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--base)] disabled:opacity-60">
            {opening === "center" ? "Abrindo…" : "Ver detalhes"}
          </button>
        </div>
        {actionError && <p className="text-center text-[11px] text-[var(--danger)]" role="alert">Não foi possível abrir a atualização. Tente novamente.</p>}
        <p className="text-center text-[10px] leading-4 text-[var(--text-muted)]">O Android confirma a instalação. O Plutão nunca instala um APK sem a sua ação.</p>
      </div>
    </div>
  );
}
