"use client";

import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { useState } from "react";

export function DownloadApkButton({ url }: { url: string }) {
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState(false);

  async function openDownload() {
    setOpening(true);
    setOpened(false);
    setError(false);
    try {
      const absoluteUrl = typeof window !== "undefined" ? new URL(url, window.location.origin).toString() : url;
      if (Capacitor.isNativePlatform()) {
        // O Browser abre o fluxo de download fora do WebView remoto, que não finaliza APKs.
        await Browser.open({ url: absoluteUrl, presentationStyle: "popover" });
      } else {
        window.location.assign(url);
      }
      setOpened(true);
    } catch {
      setError(true);
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void openDownload()} disabled={opening} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--selo)] px-4 py-2.5 text-sm font-semibold text-[var(--base)] transition hover:bg-[var(--nucleo)] disabled:cursor-wait disabled:opacity-60">
        <span aria-hidden>{opening ? "…" : "↓"}</span>
        {opening ? "Abrindo download…" : "Baixar APK"}
      </button>
      <span className="text-[10px] text-[var(--text-muted)]" role="status" aria-live="polite">
        {error ? "Não foi possível abrir. Tente novamente." : opened ? "Download aberto. Confira a notificação do Android." : "Instalação manual e segura"}
      </span>
    </div>
  );
}
