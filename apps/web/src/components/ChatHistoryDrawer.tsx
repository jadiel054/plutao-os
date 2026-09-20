"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { BrandMark } from "@/components/BrandMark";

export type ChatHistoryItem = {
  id: string;
  title: string;
  subtitle?: string;
  at?: string;
  isPinned?: boolean;
  projectId?: string | null;
  projectName?: string | null;
  shareToken?: string | null;
};

export type ProjectItem = {
  id: string;
  name: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  userEmail?: string;
  userInitial?: string;
  history: ChatHistoryItem[];
  onNewChat: () => void;
  onSelectHistory?: (id: string) => void;
  onRename?: (id: string, newTitle: string) => Promise<void>;
  onPin?: (id: string, isPinned: boolean) => Promise<void>;
  onMoveProject?: (id: string, projectId: string | null) => Promise<void>;
  onShare?: (id: string, enable: boolean) => Promise<string | null>;
  onDelete?: (id: string) => Promise<void>;
  projectsList?: ProjectItem[];
  onNotify?: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
};

export function ChatHistoryDrawer({
  open,
  onClose,
  userEmail,
  userInitial = "P",
  history,
  onNewChat,
  onSelectHistory,
  onRename,
  onPin,
  onMoveProject,
  onShare,
  onDelete,
  projectsList = [],
  onNotify,
}: Props) {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Modal states
  const [renameTarget, setRenameTarget] = useState<ChatHistoryItem | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const [projectTarget, setProjectTarget] = useState<ChatHistoryItem | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [shareTarget, setShareTarget] = useState<ChatHistoryItem | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ChatHistoryItem | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveMenuId(null);
        onClose();
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const pinnedItems = history.filter((h) => h.isPinned);
  const unpinnedItems = history.filter((h) => !h.isPinned);

  const handleOpenRename = (h: ChatHistoryItem) => {
    setActiveMenuId(null);
    setRenameTarget(h);
    setRenameTitle(h.title);
  };

  const handleSaveRename = async () => {
    if (!renameTarget || !renameTitle.trim()) return;
    try {
      await onRename?.(renameTarget.id, renameTitle.trim());
      onNotify?.("Conversa renomeada com sucesso", "success");
    } catch {
      onNotify?.("Erro ao renomear conversa", "error");
    } finally {
      setRenameTarget(null);
    }
  };

  const handleTogglePin = async (h: ChatHistoryItem) => {
    setActiveMenuId(null);
    try {
      await onPin?.(h.id, !h.isPinned);
      onNotify?.(
        !h.isPinned ? "Conversa fixada no topo" : "Conversa desafixada",
        "info"
      );
    } catch {
      onNotify?.("Erro ao alterar fixação da conversa", "error");
    }
  };

  const handleOpenMoveProject = (h: ChatHistoryItem) => {
    setActiveMenuId(null);
    setProjectTarget(h);
    setSelectedProjectId(h.projectId ?? null);
  };

  const handleSaveMoveProject = async () => {
    if (!projectTarget) return;
    try {
      await onMoveProject?.(projectTarget.id, selectedProjectId);
      onNotify?.("Projeto atualizado", "success");
    } catch {
      onNotify?.("Erro ao mover para projeto", "error");
    } finally {
      setProjectTarget(null);
    }
  };

  const handleOpenShare = async (h: ChatHistoryItem) => {
    setActiveMenuId(null);
    setShareTarget(h);
    setSharingBusy(true);

    try {
      if (h.shareToken) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        setShareLink(`${origin}/share/${h.shareToken}`);
      } else {
        const token = await onShare?.(h.id, true);
        if (token) {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          setShareLink(`${origin}/share/${token}`);
        } else {
          setShareLink(null);
        }
      }
    } catch {
      onNotify?.("Erro ao gerar link de compartilhamento", "error");
    } finally {
      setSharingBusy(false);
    }
  };

  const handleToggleShare = async (enable: boolean) => {
    if (!shareTarget) return;
    setSharingBusy(true);
    try {
      const token = await onShare?.(shareTarget.id, enable);
      if (enable && token) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        setShareLink(`${origin}/share/${token}`);
        onNotify?.("Link de compartilhamento ativado", "success");
      } else {
        setShareLink(null);
        onNotify?.("Compartilhamento desativado", "info");
      }
    } catch {
      onNotify?.("Erro ao atualizar compartilhamento", "error");
    } finally {
      setSharingBusy(false);
    }
  };

  const handleCopyShareLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    onNotify?.("Link público copiado para a área de transferência!", "success");
  };

  const handleOpenDelete = (h: ChatHistoryItem) => {
    setActiveMenuId(null);
    setDeleteTarget(h);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await onDelete?.(deleteTarget.id);
      onNotify?.("Conversa excluída", "info");
    } catch {
      onNotify?.("Erro ao excluir conversa", "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  const renderHistoryList = (items: ChatHistoryItem[]) => {
    return items.map((h) => (
      <div
        key={h.id}
        className="group relative flex items-center justify-between rounded-xl hover:bg-[var(--base)]/80 transition-colors pr-1"
      >
        <button
          type="button"
          onClick={() => {
            onSelectHistory?.(h.id);
            onClose();
          }}
          className="flex-1 min-w-0 text-left px-3 py-2.5"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {h.isPinned && (
              <span className="text-[11px] shrink-0" title="Conversa fixada">
                📌
              </span>
            )}
            <span className="block text-sm text-[var(--text-primary)] truncate font-medium">
              {h.title}
            </span>
          </div>
          {(h.subtitle || h.projectName || h.at) && (
            <span className="block text-[11px] text-[var(--text-muted)] truncate mt-0.5">
              {[h.projectName ? `📂 ${h.projectName}` : null, h.subtitle, h.at]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </button>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenuId(activeMenuId === h.id ? null : h.id);
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
            aria-label="Opções da conversa"
          >
            •••
          </button>

          {activeMenuId === h.id && (
            <div
              ref={menuRef}
              className="absolute right-0 top-8 z-[80] w-48 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-2xl space-y-0.5 text-xs text-[var(--text-primary)]"
            >
              <button
                type="button"
                onClick={() => handleOpenRename(h)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--base)] text-left cursor-pointer"
              >
                ✏️ Renomear
              </button>
              <button
                type="button"
                onClick={() => void handleTogglePin(h)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--base)] text-left cursor-pointer"
              >
                📌 {h.isPinned ? "Desafixar" : "Fixar no topo"}
              </button>
              <button
                type="button"
                onClick={() => handleOpenMoveProject(h)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--base)] text-left cursor-pointer"
              >
                📂 Mover para projeto
              </button>
              <button
                type="button"
                onClick={() => void handleOpenShare(h)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--base)] text-left cursor-pointer"
              >
                🔗 Compartilhar
              </button>
              <div className="border-t border-[var(--border)]/60 my-0.5" />
              <button
                type="button"
                onClick={() => handleOpenDelete(h)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400 text-left cursor-pointer"
              >
                🗑 Excluir
              </button>
            </div>
          )}
        </div>
      </div>
    ));
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        className={`fixed top-0 left-0 z-[70] h-full w-[min(20rem,88vw)] flex flex-col
          bg-[var(--surface)] border-r border-[var(--border)] shadow-2xl
          transition-transform duration-300 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu do chat"
      >
        <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 min-w-0">
            <BrandMark size={22} />
            <span className="text-sm font-semibold tracking-tight truncate">
              Plut<span className="text-[var(--selo)]">ão</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--base)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Fechar menu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--base)]/60 px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--selo)]/50 hover:bg-[var(--base)] transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Nova conversa
          </button>
        </div>

        <nav className="px-2 space-y-0.5">
          {[
            { href: "/cockpit", label: "Missões", hint: "Planos e evidência" },
            { href: "/planos", label: "Planos", hint: "Órbita e cota de uso" },
            { href: "/configuracoes?tab=conectores", label: "Conectores", hint: "Integrações oficiais" },
            { href: "/ajuda", label: "Ajuda", hint: "Central Plutão" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="flex flex-col px-3 py-2 rounded-xl text-left hover:bg-[var(--base)]/80 transition-colors"
            >
              <span className="text-sm font-medium text-[var(--text-primary)]">{item.label}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{item.hint}</span>
            </Link>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-3 mt-2">
          {history.length === 0 ? (
            <p className="px-3 py-6 text-xs text-[var(--text-muted)] text-center leading-relaxed">
              Ainda não há histórico nesta sessão.
              <br />
              Suas conversas ficam salvas nesta conta.
            </p>
          ) : (
            <>
              {pinnedItems.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--selo)] px-3 mb-1 font-semibold">
                    Fixadas ({pinnedItems.length})
                  </p>
                  <div className="space-y-0.5">{renderHistoryList(pinnedItems)}</div>
                </div>
              )}

              {unpinnedItems.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] px-3 mb-1">
                    {pinnedItems.length > 0 ? "Outras conversas" : "Conversas"}
                  </p>
                  <div className="space-y-0.5">{renderHistoryList(unpinnedItems)}</div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-[var(--border)] p-3 flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-[var(--selo)]/15 border border-[var(--selo)]/30 flex items-center justify-center text-sm font-semibold text-[var(--selo)] shrink-0">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[var(--text-primary)] truncate">
              {userEmail || "Conta Plutão"}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">Operador</p>
          </div>
          <Link
            href="/configuracoes"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--base)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            aria-label="Configurações"
            title="Configurações"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </aside>

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Renomear conversa</h3>
            <input
              type="text"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--selo)]"
              placeholder="Nome da conversa"
              autoFocus
            />
            <div className="flex justify-end gap-2 text-xs font-mono">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveRename()}
                disabled={!renameTitle.trim()}
                className="px-4 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] font-semibold disabled:opacity-40 cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Project Modal */}
      {projectTarget && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Mover para projeto</h3>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              <button
                type="button"
                onClick={() => setSelectedProjectId(null)}
                className={`w-full text-left px-3 py-2 rounded-xl border text-xs flex items-center justify-between cursor-pointer ${
                  selectedProjectId === null
                    ? "border-[var(--selo)] bg-[var(--selo)]/10 text-[var(--selo)] font-semibold"
                    : "border-[var(--border)] bg-[var(--base)]/50 text-[var(--text-secondary)]"
                }`}
              >
                <span>Sem projeto (Geral)</span>
                {selectedProjectId === null && <span>✓</span>}
              </button>
              {projectsList.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-xs flex items-center justify-between cursor-pointer ${
                    selectedProjectId === p.id
                      ? "border-[var(--selo)] bg-[var(--selo)]/10 text-[var(--selo)] font-semibold"
                      : "border-[var(--border)] bg-[var(--base)]/50 text-[var(--text-secondary)]"
                  }`}
                >
                  <span className="truncate">📂 {p.name}</span>
                  {selectedProjectId === p.id && <span>✓</span>}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 text-xs font-mono">
              <button
                type="button"
                onClick={() => setProjectTarget(null)}
                className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveMoveProject()}
                className="px-4 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] font-semibold cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareTarget && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Compartilhar conversa</h3>
              <button
                type="button"
                onClick={() => setShareTarget(null)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Qualquer pessoa com o link público poderá visualizar o objetivo e progresso desta conversa em modo apenas-leitura.
            </p>

            {sharingBusy ? (
              <p className="text-xs font-mono text-[var(--text-muted)]">Processando link…</p>
            ) : shareLink ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareLink}
                    className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs text-[var(--text-primary)] font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleCopyShareLink}
                    className="px-3 py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    Copiar
                  </button>
                </div>
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-[var(--text-muted)]">Link público ativo</span>
                  <button
                    type="button"
                    onClick={() => void handleToggleShare(false)}
                    className="text-rose-400 hover:underline font-mono text-[11px] cursor-pointer"
                  >
                    Desativar link
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[var(--text-muted)] italic">Nenhum link ativo para esta conversa.</p>
                <button
                  type="button"
                  onClick={() => void handleToggleShare(true)}
                  className="w-full py-2 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold cursor-pointer"
                >
                  Gerar link público
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-rose-400">Excluir conversa?</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Tem certeza que deseja excluir &ldquo;<strong className="text-[var(--text-primary)]">{deleteTarget.title}</strong>&rdquo;? Esta ação não poderá ser desfeita.
            </p>
            <div className="flex justify-end gap-2 text-xs font-mono">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                className="px-4 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 font-semibold cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
