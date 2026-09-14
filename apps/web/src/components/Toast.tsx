"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
}

export interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, 4000);

    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const handleManualDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  const typeStyles: Record<ToastType, { bg: string; border: string; icon: string; text: string }> = {
    success: {
      bg: "bg-emerald-950/90 dark:bg-emerald-950/90 text-emerald-100",
      border: "border-emerald-600/50",
      icon: "✓",
      text: "text-emerald-400",
    },
    error: {
      bg: "bg-red-950/90 dark:bg-red-950/90 text-red-100",
      border: "border-red-600/50",
      icon: "✕",
      text: "text-red-400",
    },
    warning: {
      bg: "bg-amber-950/90 dark:bg-amber-950/90 text-amber-100",
      border: "border-amber-600/50",
      icon: "⚠️",
      text: "text-amber-400",
    },
    info: {
      bg: "bg-blue-950/90 dark:bg-blue-950/90 text-blue-100",
      border: "border-blue-600/50",
      icon: "ℹ️",
      text: "text-blue-400",
    },
  };

  const style = typeStyles[toast.type];

  return (
    <div
      className={`
        pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-md shadow-xl transition-all duration-200
        ${style.bg} ${style.border}
        ${exiting ? "opacity-0 translate-y-2 scale-95" : "opacity-100 translate-y-0 scale-100"}
      `}
    >
      <span className={`text-sm font-bold shrink-0 mt-0.5 ${style.text}`}>{style.icon}</span>
      <div className="flex-1 text-xs leading-relaxed">
        {toast.title && <div className="font-semibold mb-0.5">{toast.title}</div>}
        <div>{toast.message}</div>
      </div>
      <button
        type="button"
        onClick={handleManualDismiss}
        className="text-xs text-[var(--text-muted)] hover:text-white transition-colors shrink-0 p-1"
        aria-label="Fechar notificação"
      >
        ✕
      </button>
    </div>
  );
}
