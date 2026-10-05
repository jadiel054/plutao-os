"use client";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";

type Manifest = {
  latest: { versionCode: number; versionName: string; notes: string } | null;
  minSupported: number;
};

const CACHE_KEY = "plutao:update-check:v2";
const DISMISSED_PREFIX = "plutao:update-dismissed:v1:";
const DAY_MS = 24 * 60 * 60 * 1000;

export function UpdateChecker() {
  const [update, setUpdate] = useState<Manifest["latest"]>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    const check = async () => {
      try {
        const info = await App.getInfo();
        const currentCode = Number.parseInt(info.build, 10) || 0;
        const cached = localStorage.getItem(CACHE_KEY);
        let manifest: Manifest | null = null;
        if (cached) {
          const parsed = JSON.parse(cached) as { checkedAt: number; manifest: Manifest };
          if (Date.now() - parsed.checkedAt < DAY_MS) manifest = parsed.manifest;
        }
        if (!manifest) {
          const response = await fetch("/api/updates/manifest.json", { cache: "no-store" });
          if (!response.ok) return;
          manifest = (await response.json()) as Manifest;
          localStorage.setItem(CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), manifest }));
        }
        if (!active || !manifest) return;
        if (currentCode < manifest.minSupported) setBlocked(true);
        else if (manifest.latest && currentCode < manifest.latest.versionCode) {
          const dismissed = localStorage.getItem(`${DISMISSED_PREFIX}${manifest.latest.versionCode}`) === "1";
          if (!dismissed) setUpdate(manifest.latest);
        }
      } catch {
        // Update checks are advisory and must never prevent app startup on network errors.
      }
    };
    void check();
    return () => { active = false; };
  }, []);

  if (!update && !blocked) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg rounded-2xl border border-[var(--selo)]/50 bg-[var(--surface)] p-4 shadow-2xl" role={blocked ? "alertdialog" : "status"} aria-modal={blocked || undefined}>
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--selo)]">{blocked ? "Atualização obrigatória" : "Nova versão do Plutão"}</p>
        {!blocked && <button
          type="button"
          aria-label="Dispensar aviso de atualização"
          onClick={() => {
            if (update) localStorage.setItem(`${DISMISSED_PREFIX}${update.versionCode}`, "1");
            setUpdate(null);
          }}
          className="-mr-1 -mt-1 rounded-lg px-2 py-1 text-lg leading-none text-[var(--text-muted)] hover:bg-[var(--base)] hover:text-[var(--text-primary)]"
        >×</button>}
      </div>
      <h2 className="mt-1 text-base font-semibold">{blocked ? "Atualize para continuar" : `Plutão ${update?.versionName}`}</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{blocked ? "Esta versão não é mais suportada. Baixe o APK oficial e instale pelo Android." : update?.notes || "Há uma atualização disponível."}</p>
      <button type="button" onClick={() => window.location.assign("/download")} className="mt-4 rounded-xl bg-[var(--selo)] px-4 py-2.5 text-sm font-semibold text-[var(--base)]">Abrir central de atualização</button>
    </div>
  );
}
