"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

function safeNextPath(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/cockpit";
}

/**
 * Recebe plutao://oauth/callback do navegador externo e faz a troca única
 * dentro do WebView. O token nunca é logado; o endpoint o consome e o troca
 * por um cookie HTTP-only da própria WebView.
 */
export function MobileOAuthBridge() {
  useEffect(() => {
    let disposed = false;
    const listener = App.addListener("appUrlOpen", ({ url }) => {
      if (disposed || !url.startsWith("plutao://oauth/")) return;
      try {
        const parsed = new URL(url);
        const token = parsed.searchParams.get("token");
        if (!token) return;
        void Browser.close().catch(() => undefined);
        const next = safeNextPath(parsed.searchParams.get("next"));
        const completeUrl = `/api/auth/mobile/complete?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
        window.location.assign(completeUrl);
      } catch {
        window.location.assign("/login?error=MobileOAuthFailed");
      }
    });
    return () => {
      disposed = true;
      void listener.then((handle) => handle.remove());
    };
  }, []);

  return null;
}
