"use client";

import { useState, useEffect } from "react";

export interface LongInputModalProps {
  isOpen: boolean;
  initialText: string;
  onClose: () => void;
  onConfirmTransform: (transformedText: string) => void;
}

/** Mock function to transform long input into an artifact reference or formatted text */
export async function transformLongInput(text: string): Promise<string> {
  // TODO: integrar com a API real de artefatos /api/artifacts
  return text;
}

export function LongInputModal({
  isOpen,
  initialText,
  onClose,
  onConfirmTransform,
}: LongInputModalProps) {
  const [content, setContent] = useState(initialText);
  const [isTransforming, setIsTransforming] = useState(false);

  useEffect(() => {
    setContent(initialText);
  }, [initialText]);

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
    setIsTransforming(true);
    try {
      const result = await transformLongInput(content);
      onConfirmTransform(result);
    } catch {
      // fallback
      onConfirmTransform(content);
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
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Transformar em Artefato
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Textos extensos podem ser convertidos em artefatos para otimizar o contexto do agente.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg hover:bg-[var(--base)] transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-h-0 space-y-2">
          <label className="text-xs font-mono text-[var(--text-muted)]">
            CONTEÚDO DO TEXTO ({content.length} caracteres)
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full flex-1 min-h-[240px] max-h-[50vh] p-4 rounded-xl border border-[var(--border)] bg-[var(--base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)] transition-colors resize-none font-sans leading-relaxed"
            placeholder="Cole ou edite seu texto longo aqui..."
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)] shrink-0">
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
            onClick={handleTransform}
            className="px-5 py-2 rounded-xl bg-[var(--selo)] hover:bg-[var(--nucleo)] text-[var(--base)] text-xs font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm cursor-pointer"
          >
            {isTransforming ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--base)]/30 border-t-[var(--base)] animate-spin" />
                Transformando…
              </>
            ) : (
              <>✨ Transformar</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
