"use client";

import { useState, useEffect } from "react";

export type ArtifactRef = {
  id: string;
  name: string;
  type: string;
  size: number;
  thumbnailUrl?: string;
};

export interface LongInputModalProps {
  isOpen: boolean;
  initialText: string;
  onClose: () => void;
  onConfirmTransform: (artifact: ArtifactRef) => void;
  onOpenFileSelector?: () => void;
  onError?: (message: string) => void;
}

export function LongInputModal({
  isOpen,
  initialText,
  onClose,
  onConfirmTransform,
  onOpenFileSelector,
  onError,
}: LongInputModalProps) {
  const [content, setContent] = useState(initialText);
  const [isTransforming, setIsTransforming] = useState(false);

  useEffect(() => {
    setContent(initialText);
  }, [initialText, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTransform = async () => {
    if (!content.trim() || isTransforming) return;
    setIsTransforming(true);
    try {
      const res = await fetch("/api/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.artifact) {
        onError?.(data.error ?? "Falha ao salvar arquivo");
        return;
      }
      onConfirmTransform({
        id: data.artifact.id,
        name: data.artifact.name,
        type: data.artifact.type,
        size: data.artifact.size,
      });
    } catch {
      onError?.("Erro de rede ao salvar arquivo");
    } finally {
      setIsTransforming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-3xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl space-y-4 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Salvar como arquivo
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Textos longos são salvos como arquivo. O chat envia apenas a referência.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1">
            ✕
          </button>
        </div>

        <div className="flex-1 flex flex-col gap-2 min-h-0">
          <label className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
            Conteúdo ({content.length.toLocaleString()} caracteres)
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full flex-1 min-h-[240px] max-h-[50vh] p-4 rounded-xl border border-[var(--border)] bg-[var(--base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)] transition-colors resize-none font-sans leading-relaxed"
            placeholder="Cole ou edite seu texto longo aqui..."
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border)] shrink-0">
          {onOpenFileSelector ? (
            <button
              type="button"
              disabled={isTransforming}
              onClick={() => {
                onClose();
                onOpenFileSelector();
              }}
              className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs font-medium text-[var(--text-secondary)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              📁 Selecionar arquivo local
            </button>
          ) : <div />}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isTransforming}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isTransforming || !content.trim()}
              onClick={() => void handleTransform()}
              className="px-5 py-2 rounded-xl bg-[var(--selo)] hover:bg-[var(--nucleo)] text-[var(--base)] text-xs font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {isTransforming ? "Salvando…" : "Salvar arquivo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
