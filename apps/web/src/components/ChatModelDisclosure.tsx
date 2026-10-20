"use client";

import { useState } from "react";
import type { InstalledModel } from "@/lib/models/localModelManager";

type Props = {
  selectedModel: string;
  installedModels: InstalledModel[];
  onSelect: (value: string) => void;
  onManage: () => void;
};

export function ChatModelDisclosure({ selectedModel, installedModels, onSelect, onManage }: Props) {
  const [open, setOpen] = useState(false);
  const active = installedModels.find((model) => model.id === selectedModel);
  const label = active ? `Local · ${active.name}` : "Nuvem · AUTO";

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)]/55 px-4 py-1.5 text-xs font-mono">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="chat-model-options"
          className="group flex min-h-9 min-w-0 items-center gap-2 rounded-lg px-1.5 text-left text-[var(--text-secondary)] transition hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
        >
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Modelo</span>
          <span className="truncate font-semibold text-[var(--text-primary)]">{label}</span>
          {active && <span className="hidden rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 sm:inline">On-device</span>}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d={open ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
          </svg>
        </button>
        <span className="hidden text-[10px] text-[var(--text-muted)] sm:inline">{open ? "Fechar" : "Ajustar"}</span>
      </div>

      {open && (
        <div id="chat-model-options" className="mx-auto mt-1 flex max-w-4xl flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--base)]/80 p-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <label htmlFor="chat-model-select" className="sr-only">Escolher modelo</label>
          <select
            id="chat-model-select"
            value={selectedModel || "cloud"}
            onChange={(event) => onSelect(event.target.value)}
            className="min-h-9 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--selo)]"
          >
            <option value="cloud">Nuvem (AUTO cloud)</option>
            {installedModels.map((model) => (
              <option key={model.id} value={model.id}>Local · {model.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={onManage}
            className="min-h-9 rounded-lg px-2.5 text-[10px] font-semibold text-[var(--selo)] transition hover:bg-[var(--surface)] hover:underline"
          >
            {installedModels.length === 0 ? "+ Instalar modelo local" : "Gerenciar modelos"}
          </button>
        </div>
      )}
    </div>
  );
}
