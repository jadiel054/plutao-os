"use client";

import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

export function isNativeCapacitor(): boolean {
  return Capacitor.isNativePlatform();
}

/** Abre o IdP no navegador do sistema, não em uma aba interna do WebView. */
export async function openOAuthInSystemBrowser(url: string): Promise<void> {
  await Browser.open({ url, presentationStyle: "popover" });
}
