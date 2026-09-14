/**
 * ModelFilterMenu — Componente de menu de filtros estilo Hugging Face
 */

"use client";

import { ModelFilterOptions, ModelCategory } from "@plutao/domain";

interface ModelFilterMenuProps {
  isOpen: boolean;
  onClose: () => void;
  options: ModelFilterOptions;
  onChange: (newOptions: ModelFilterOptions) => void;
  onReset: () => void;
}

export function ModelFilterMenu({
  isOpen,
  onClose,
  options,
  onChange,
  onReset,
}: ModelFilterMenuProps) {
  if (!isOpen) return null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🎛️</span>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Filtros & Ordenação de Modelos</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] font-mono text-[var(--nucleo)] hover:underline cursor-pointer"
          >
            Limpar Filtros
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-[var(--base)] cursor-pointer"
          >
            ✕ Fechar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {/* Provedor */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-[var(--text-muted)] block">PROVEDOR / EXECUÇÃO</label>
          <select
            value={options.provider}
            onChange={(e) =>
              onChange({
                ...options,
                provider: e.target.value as "all" | "cloud" | "local",
              })
            }
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)]"
          >
            <option value="all">🌐 Todos os Provedores</option>
            <option value="cloud">☁️ Nuvem (Groq / OpenRouter)</option>
            <option value="local">💻 Local Browser (WebGPU / CPU)</option>
          </select>
        </div>

        {/* Categoria */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-[var(--text-muted)] block">CATEGORIA DE TAREFA</label>
          <select
            value={options.category}
            onChange={(e) =>
              onChange({
                ...options,
                category: e.target.value as "all" | ModelCategory,
              })
            }
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)]"
          >
            <option value="all">📑 Todas as Categorias</option>
            <option value="text">💬 Geração de Texto / Chat</option>
            <option value="code">💻 Código e Raciocínio</option>
            <option value="vision">👁️ Visão & OCR (Multimodal)</option>
            <option value="lightweight">⚡ Ultraleve / Embeddings</option>
          </select>
        </div>

        {/* Status de Download */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-[var(--text-muted)] block">STATUS DE DISPONIBILIDADE</label>
          <select
            value={options.status}
            onChange={(e) =>
              onChange({
                ...options,
                status: e.target.value as "all" | "downloaded" | "available",
              })
            }
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)]"
          >
            <option value="all">📦 Todos os Status</option>
            <option value="downloaded">✅ Baixados / Prontos</option>
            <option value="available">⬇️ Disponíveis para Baixar</option>
          </select>
        </div>

        {/* Ordenar Por */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-[var(--text-muted)] block">ORDENAR POR</label>
          <select
            value={options.sortBy}
            onChange={(e) =>
              onChange({
                ...options,
                sortBy: e.target.value as "name" | "size" | "speed" | "parameters",
              })
            }
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)]"
          >
            <option value="name">🔤 Nome (A-Z)</option>
            <option value="speed">⚡ Velocidade</option>
            <option value="size">💾 Tamanho em Disco</option>
            <option value="parameters">📊 Parâmetros</option>
          </select>
        </div>
      </div>
    </div>
  );
}
