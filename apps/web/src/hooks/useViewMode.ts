"use client";

import { useCallback, useEffect, useState } from "react";

export type ViewMode = "mobile" | "desktop";

const STORAGE_KEY = "plutao_view_mode";
const DESKTOP_VIEWPORT = "width=1280, initial-scale=1, maximum-scale=1, user-scalable=no";
const MOBILE_VIEWPORT =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";

function readStored(): ViewMode {
  if (typeof window === "undefined") return "mobile";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "desktop" || v === "mobile") return v;
  } catch {
    /* ignore */
  }
  return window.matchMedia("(min-width: 768px)").matches ? "desktop" : "mobile";
}

function applyViewport(mode: ViewMode) {
  if (typeof document === "undefined") return;
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
}

/**
 * Toggle layout like browser "Request desktop site".
 * Forces viewport width so Tailwind md/sm breakpoints follow the chosen mode.
 */
export function useViewMode() {
  const [mode, setModeState] = useState<ViewMode>("mobile");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = readStored();
    setModeState(initial);
    applyViewport(initial);
    setReady(true);
  }, []);

  const setMode = useCallback((next: ViewMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyViewport(next);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === "desktop" ? "mobile" : "desktop");
  }, [mode, setMode]);

  return { mode, setMode, toggle, ready, isDesktop: mode === "desktop" };
}
