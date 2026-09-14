/**
 * ModelTestModal — Modal de teste interativo para validar modelo com prompt customizado
 */

"use client";

import { useState } from "react";
import { AIModel } from "@plutao/domain";
import { TestResult } from "@/hooks/useModelManager";

interface ModelTestModalProps {
  model: AIModel | null;
  isOpen: boolean;
  isTesting: boolean;
  testResult: TestResult | null;
  onClose: () => void;
  onRunTest: (model: AIModel, prompt: string) => void;
}

export function ModelTestModal({
  model,
  isOpen,
  isTesting,
  testResult,
  onClose,
  onRunTest,
}: ModelTestModalProps) {
  const [prompt, setPrompt] = useState("Resuma o propósito do sistema Plutão e suas capacidades offline em 2 frases.");

  if (!isOpen || !model) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden space-y-0 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--base)]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧪</span>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Teste de Inferência — {model.name}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] font-mono">
                {model.providerName} • {model.parameters}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-[var(--surface)] cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Prompt Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-[var(--text-muted)] block">PROMPT DE TESTE</label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Digite uma mensagem para testar a resposta do modelo…"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] p-3 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)] transition-colors resize-none"
            />
          </div>

          {/* Test Trigger Button */}
          <button
            type="button"
            disabled={isTesting || !prompt.trim()}
            onClick={() => onRunTest(model, prompt)}
            className="w-full py-2.5 rounded-xl bg-[var(--selo)] text-[var(--base)] font-semibold text-xs hover:bg-[var(--nucleo)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {isTesting ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-[var(--base)]/30 border-t-[var(--base)] animate-spin" />
                Gerando resposta do modelo…
              </>
            ) : (
              <>▶️ Executar Inferência de Teste</>
            )}
          </button>

          {/* Output Display */}
          {testResult && (
            <div className="space-y-2 pt-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-[var(--text-muted)]">RESPOSTA DO MODELO</span>
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400 font-semibold">⚡ {testResult.latencyMs} ms</span>
                  {testResult.tokensGenerated && (
                    <span className="text-[var(--text-muted)]">~{testResult.tokensGenerated} tokens</span>
                  )}
                </div>
              </div>

              {testResult.error ? (
                <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-xs text-red-300 font-mono">
                  🚨 Error: {testResult.error}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--base)] text-xs font-mono text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                  {testResult.output}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--base)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
          >
            Fechar Teste
          </button>
        </div>
      </div>
    </div>
  );
}
