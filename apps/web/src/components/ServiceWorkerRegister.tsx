"use client";

import { useEffect } from "react";

/**
 * Registers the Plutão service worker for transparent PWA updates.
 * New Vercel deployments activate via skipWaiting + clients.claim
 * without requiring uninstall/reinstall.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        if (registration.waiting) {
          registration.waiting.postMessage("SKIP_WAITING");
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              newWorker.postMessage("SKIP_WAITING");
            }
          });
        });
      } catch (err) {
        console.warn("[Plutão] SW registration failed:", err);
      }
    };

    register();
  }, []);

  return null;
}
