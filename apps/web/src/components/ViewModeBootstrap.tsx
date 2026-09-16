"use client";

import { useEffect } from "react";

const STORAGE_KEY = "plutao_view_mode";
const DESKTOP_VIEWPORT = "width=1280, initial-scale=1, maximum-scale=1, user-scalable=no";
const MOBILE_VIEWPORT =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";

/** Apply saved view mode early to reduce layout flash. */
export function ViewModeBootstrap() {
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      const mode = v === "desktop" ? "desktop" : v === "mobile" ? "mobile" : null;
      if (!mode) return;
      let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "viewport";
        document.head.appendChild(meta);
      }
      meta.content = mode === "desktop" ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT;
      document.documentElement.dataset.viewMode = mode;
      document.documentElement.classList.toggle("view-desktop", mode === "desktop");
      document.documentElement.classList.toggle("view-mobile", mode === "mobile");
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
