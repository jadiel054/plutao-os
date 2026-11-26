"use client";

import { useState } from "react";
import { providerDisplayName } from "@/lib/chat/toolLogos";
import { groupConsecutiveByProvider } from "@/lib/chat/toolGroups";
import { ToolLogo } from "./ToolLogos";

export type ToolCallItem = {
  id: string;
  provider: string;
  capability: string;
  status: "executing" | "ok" | "error" | "GATE_PENDING" | "approved" | "executed" | "rejected" | "failed";
  summaryInput?: string;
  summaryOutput?: string;
  fullInput?: unknown;
  fullOutput?: unknown;
  durationMs?: number;
  gateId?: string;
};

type ActionCardsProps = {
  toolCalls: ToolCallItem[];
};

function formatPayload(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function humanOperation(provider: string, capability: string): string {
  const cleanCap = capability.replace(/^(github|vercel)\./, "");
  const map: Record<string, string> = {
    repo_get: "Obter repositório",
    repos_list: "Listar repositórios",
    tree: "Árvore de arquivos",
    code_search: "Buscar no código",
    issues_list: "Listar issues",
    issues_get: "Obter issue",
    pulls_list: "Listar pull requests",
    prs_list: "Listar pull requests",
    prs_get: "Obter pull request",
    prs_create: "Criar pull request",
    branches_list: "Listar branches",
    branches_create: "Criar branch",
    push_files: "Enviar arquivos",
    files_write: "Enviar arquivos",
    repo_create: "Criar repositório",
    actions_list: "Listar actions",
  };

  return map[cleanCap] ?? map[capability] ?? cleanCap.replace(/_/g, " ") || capability;
}

function statusLabel(status: ToolCallItem["status"]): string {
  switch (status) {
    case "executing": return "Executando";
    case "approved": return "Aprovado, executando…";
    case "GATE_PENDING": return "Aprovação necessária";
    case "ok":
    case "executed": return "Concluído";
    case "rejected": return "Recusado";
    default: return "Erro";
  }
}

function statusDotClass(status: ToolCallItem["status"]): string {
  if (status === "executing" || status === "approved") return "bg-amber-400 animate-pulse";
  if (status === "GATE_PENDING") return "bg-amber-400";
  if (status === "ok" || status === "executed") return "bg-emerald-400";
  if (status === "rejected") return "bg-zinc-400";
  return "bg-rose-400";
}

function statusTextClass(status: ToolCallItem["status"]): string {
  if (status === "executing" || status === "approved" || status === "GATE_PENDING") return "text-amber-400";
  if (status === "ok" || status === "executed") return "text-emerald-400";
  if (status === "rejected") return "text-zinc-400";
  return "text-rose-400";
}

/** Linha de uma operacao dentro do bloco do provedor: estado individual + detalhes recolhiveis. */
function OperationRow({ tc }: { tc: ToolCallItem }) {
  const [open, setOpen] = useState(false);

  const requestText =
    formatPayload(tc.fullInput) ||
    (tc.summaryInput ? String(tc.summaryInput) : "");

  const responseText =
    formatPayload(tc.fullOutput) ||
    (tc.summaryOutput ? String(tc.summaryOutput) : "");
  const hasDetails = Boolean(requestText || responseText);
  const isPendingGate = tc.status === "GATE_PENDING";

  return (
    <li key={tc.id} className="min-w-0">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3.5 py-2 text-left cursor-pointer disabled:cursor-default"
        aria-expanded={open}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDotClass(tc.status)}`}
          aria-hidden
        />
        <span className="text-[12px] text-[var(--text-primary)] truncate">
          {humanOperation(tc.provider, tc.capability)}
        </span>
        {tc.durationMs !== undefined && (
          <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
            {tc.durationMs}ms
          </span>
        )}
        {isPendingGate && (
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
            Aprovação necessária
          </span>
        )}
        <span
          className={`ml-auto text-[10px] font-medium shrink-0 ${statusTextClass(tc.status)}`}
          role="status"
          aria-live={tc.status === "executing" ? "polite" : undefined}
        >
          {statusLabel(tc.status)}
        </span>
        {hasDetails && (
          <span className="text-[9px] opacity-50 shrink-0" aria-hidden>
            {open ? "▼" : "▶"}
          </span>
        )}
      </button>

      {open && hasDetails && (
        <div className="px-3.5 pb-2.5 space-y-2">
          {requestText ? (
            <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] bg-[var(--base)]/60 rounded-lg px-2.5 py-2 max-h-44 overflow-y-auto">
              {requestText}
            </pre>
          ) : null}
          {responseText ? (
            <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] bg-[var(--base)]/60 rounded-lg px-2.5 py-2 max-h-44 overflow-y-auto">
              {responseText}
            </pre>
          ) : null}
        </div>
      )}
    </li>
  );
}

/**
 * Atividade do agente agrupada: blocos CONSECUTIVOS por provedor, na ordem
 * cronologica real dos eventos. Cada operacao preserva id e estado individual;
 * a chamada em execucao atualiza em tempo real e o bloco permanece no historico.
 * Visual discreto: linhas integradas ao chat, sem cards pesados por operacao.
 */
export function ActionCards({ toolCalls }: ActionCardsProps) {
  if (!toolCalls || toolCalls.length === 0) return null;

  const groups = groupConsecutiveByProvider(toolCalls);

  return (
    <div className="my-3 space-y-2">
      {groups.map((group, gi) => (
        <div
          key={`${group.provider}-${gi}-${group.calls[0]?.id ?? ""}`}
          className="rounded-xl border border-[var(--border)]/40 bg-[var(--base)]/40 overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3.5 py-2 border-b border-[var(--border)]/25">
            <ToolLogo provider={group.provider} size={14} />
            <span className="text-[12px] font-medium text-[var(--text-primary)] tracking-tight">
              {providerDisplayName(group.provider)}
            </span>
            {group.calls.length > 1 && (
              <span className="text-[10px] text-[var(--text-muted)]">
                ({group.calls.length} {group.calls.length === 1 ? "operação" : "operações"})
              </span>
            )}
          </div>
          <ul className="divide-y divide-[var(--border)]/20">
            {group.calls.map((tc) => (
              <OperationRow key={tc.id} tc={tc} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
