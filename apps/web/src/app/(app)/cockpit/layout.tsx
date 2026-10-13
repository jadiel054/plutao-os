"use client";

import { useCallback, useState } from "react";
import { CockpitWorkerQueuePanel } from "@/components/CockpitWorkerQueuePanel";
import { ToastContainer, type ToastMessage, type ToastType } from "@/components/Toast";

/**
 * Cockpit layout — injects the durable worker queue panel above the page body.
 * Panel toasts are local to this layout.
 */
export default function CockpitLayout({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = useCallback((message: string, type: ToastType = "info", title?: string) => {
    setToasts((prev) => [...prev, { id: crypto.randomUUID(), message, type, title }]);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <>
      <div className="mx-auto max-w-4xl w-full px-4 pt-6">
        <CockpitWorkerQueuePanel onNotify={addToast} />
      </div>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
