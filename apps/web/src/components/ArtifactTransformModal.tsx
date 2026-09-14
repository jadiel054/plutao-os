"use client";

import { useEffect, useState } from "react";

export interface ArtifactTransformModalProps {
  isOpen: boolean;
  initialContent: string;
  onClose: () => void;
  onConfirm: (transformedContent: string) => void;
}

// TODO: Integrar com a API real de artefatos (/api/artifacts)
async function transformLongInput(text: string): Promise<string> {
  return text;
}

export function ArtifactTransformModal({
  isOpen,
  initialContent,
  onClose,
  onConfirm,
}: ArtifactTransformModalProps) {
  const [content, setContent] = useState(initialContent);
  const [transforming, setTransforming] = useState(false);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTransform = async () => {
    setTransforming(true);
    try {
      const result = await transformLongInput(content);
      onConfirm(result);
    } finally {
      setTransforming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-3xl h-[85vh] bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl flex flex-col space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Smart Long-Input · Transformar em Artefato
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Texto longo detectado (1.500+ caracteres). Revise e estruture o conteúdo antes de enviar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1.5 rounded-lg hover:bg-[var(--base)] transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Textarea */}
        <div className="flex-1 flex flex-col min-h-0 space-y-2">
          <div className="flex justify-between items-center text-xs font-mono text-[var(--text-muted)] shrink-0">
            <span>CONTEÚDO DO ARTEFATO</span>
            <span>{content.length} caracteres</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={transforming}
            className="flex-1 w-full bg-[var(--base)] border border-[var(--border)] rounded-xl p-4 text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)] resize-none leading-relaxed disabled:opacity-50"
            placeholder="Digite ou cole o texto do artefato aqui..."
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)] shrink-0">
          <button
            type="button"
            disabled={transforming}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={transforming || !content.trim()}
            onClick={() => void handleTransform()}
            className="px-5 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:bg-[var(--nucleo)] transition-colors flex items-center gap-2 disabled:opacity-40 cursor-pointer shadow-sm"
          >
            {transforming ? (
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
