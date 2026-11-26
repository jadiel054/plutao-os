"use client";

import { useState } from "react";
import type { ArtifactRef } from "@/components/LongInputModal";
import { formatFileSize } from "@/lib/artifacts";
import { parseTableBody } from "@/lib/chat/visualBlocks";
import { DataTable } from "./DataTable";

type ArtifactLoadState = "idle" | "loading" | "ready" | "error";

/**
 * Apresentacao visual dos artefatos dentro da propria conversa:
 * - imagens: preview inline (erro real, clique abre o anotador);
 * - documentos texto/csv/json: pre-visualizacao recolhivel via /api/artifacts/[id]/preview;
 * - PDF/binarios: abertura direta da rota privada de conteudo, com erro visivel;
 * - fallback: chip discreto com nome e tamanho (comportamento anterior preservado).
 * Nenhum dado simulado: estados refletem apenas fetches reais.
 */
export function MessageArtifacts({
  artifacts,
  onOpenAnnotator,
}: {
  artifacts?: ArtifactRef[];
  onOpenAnnotator: (artifact: ArtifactRef) => void;
}) {
  if (!artifacts || artifacts.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {artifacts.map((art) => (
        <ArtifactCard key={art.id} artifact={art} onOpenAnnotator={onOpenAnnotator} />
      ))}
    </div>
  );
}

function fileIcon(type: string): string {
  if (type.startsWith("image/")) return "🖼";
  if (type === "application/pdf") return "📕";
  if (type.includes("spreadsheet") || type.includes("excel") || type.includes("csv")) return "📊";
  if (type.includes("json")) return "🧾";
  if (type.startsWith("text/")) return "📄";
  return "📎";
}

function ArtifactCard({
  artifact,
  onOpenAnnotator,
}: {
  artifact: ArtifactRef;
  onOpenAnnotator: (artifact: ArtifactRef) => void;
}) {
  const isImage = artifact.type.startsWith("image/") || Boolean(artifact.thumbnailUrl);
  const isPdf = artifact.type === "application/pdf";
  const isTextual = artifact.type.startsWith("text/") || artifact.type.includes("json");
  const [state, setState] = useState<ArtifactLoadState>(artifact.thumbnailUrl && isImage ? "ready" : "idle");
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function loadPreview(): Promise<void> {
    setState("loading");
    try {
      const res = await fetch(`/api/artifacts/${artifact.id}/preview`, { cache: "no-store" });
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = await res.json().catch(() => null);
      const text = typeof data?.text === "string" ? data.text : "";
      if (!text.trim()) {
        setState("error");
        return;
      }
      setPreviewText(text);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  async function openContent(): Promise<void> {
    setState("loading");
    try {
      const res = await fetch(`/api/artifacts/${artifact.id}/content`, { cache: "no-store" });
      if (!res.ok) {
        setState("error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  if (isImage && artifact.thumbnailUrl) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenAnnotator(artifact)}
          className="w-12 h-12 rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--selo)] transition-colors shrink-0 cursor-pointer"
          title="Clique para visualizar/anotar"
        >
          <img
            src={artifact.thumbnailUrl}
            alt={artifact.name}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setState("error")}
          />
        </button>
        <ArtifactMeta artifact={artifact} state={state} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)]/50 bg-[var(--base)]/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <span aria-hidden className="shrink-0 text-sm">{fileIcon(artifact.type)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-[var(--text-primary)] truncate">{artifact.name}</p>
          <p className="text-[10px] font-mono text-[var(--text-muted)]">
            {artifact.type || "arquivo"} · {formatFileSize(artifact.size)}
          </p>
        </div>
        {state === "loading" ? (
          <span className="w-3.5 h-3.5 border-2 border-[var(--selo)] border-t-transparent rounded-full animate-spin shrink-0" aria-label="Carregando" />
        ) : null}
        {isTextual ? (
          <button
            type="button"
            onClick={() => {
              const next = !expanded;
              setExpanded(next);
              if (next && state === "idle") void loadPreview();
            }}
            className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--selo)] hover:border-[var(--selo)]/50 transition-colors cursor-pointer"
            aria-expanded={expanded}
          >
            {expanded ? "Recolher" : "Pré-visualizar"}
          </button>
        ) : null}
        {isPdf || (!isTextual && !isImage) ? (
          <button
            type="button"
            onClick={() => void openContent()}
            className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--selo)] hover:border-[var(--selo)]/50 transition-colors cursor-pointer"
          >
            Abrir
          </button>
        ) : null}
      </div>

      {state === "error" ? (
        <p className="px-3 pb-2 text-[10px] text-[var(--danger)] font-mono" role="alert">
          Não foi possível carregar o conteúdo deste arquivo agora.
        </p>
      ) : null}

      {expanded && isTextual ? (
        <div className="px-3 pb-2.5">
          {state === "loading" ? (
            <div className="space-y-1.5" aria-hidden>
              <div className="h-2.5 rounded bg-[var(--border)]/60 w-11/12 chat-skeleton" />
              <div className="h-2.5 rounded bg-[var(--border)]/60 w-4/5 chat-skeleton" />
              <div className="h-2.5 rounded bg-[var(--border)]/60 w-3/5 chat-skeleton" />
            </div>
          ) : previewText ? (
            <TableOrText text={previewText} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** CSV/JSON tabular vira tabela estruturada; demais textos ficam em bloco mono. */
function TableOrText({ text }: { text: string }) {
  const spec = parseTableBody(text);
  if (spec && spec.rows.length > 0 && spec.columns.length > 1) {
    return <DataTable spec={{ ...spec, title: spec.title || "Pré-visualização" }} />;
  }
  return (
    <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] bg-[var(--base)]/60 rounded-lg px-2.5 py-2 max-h-56 overflow-y-auto">
      {text.slice(0, 20_000)}
    </pre>
  );
}

function ArtifactMeta({ artifact, state }: { artifact: ArtifactRef; state: ArtifactLoadState }) {
  return (
    <div className="flex flex-col text-[10px] font-mono opacity-80 min-w-0">
      <span className="font-semibold truncate max-w-[140px]">{artifact.name}</span>
      <span>
        {formatFileSize(artifact.size)}
        {state === "error" ? <span className="text-[var(--danger)]"> · falha ao carregar</span> : null}
      </span>
    </div>
  );
}
