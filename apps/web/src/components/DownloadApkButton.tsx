"use client";

import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { useState } from "react";

export function DownloadApkButton({ url }: { url: string }) {
  const [opening, setOpening] = useState(false);

  async function openDownload() {
    setOpening(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // O Browser abre o fluxo de download fora do WebView remoto, que não finaliza APKs.
        await Browser.open({ url, presentationStyle: "popover" });
      } else {
        window.location.assign(url);
      }
    } finally {
      setOpening(false);
    }
  }

  return <button type="button" onClick={() => void openDownload()} disabled={opening} className="mt-4 inline-flex rounded-xl bg-[var(--selo)] px-4 py-2.5 text-sm font-semibold text-[var(--base)] hover:bg-[var(--nucleo)] disabled:opacity-60">
    {opening ? "Abrindo download…" : "Baixar APK"}
  </button>;
}
