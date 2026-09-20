"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useModelMode, getStatusColor } from "@/hooks/useModelMode";
import { UserMenu } from "@/components/UserMenu";
import { ModeControlModal } from "@/components/ModeControlModal";
import { ViewModeToggle } from "@/components/ViewModeToggle";
import { BrandMark } from "@/components/BrandMark";

export interface HeaderProps {
  userEmail?: string;
  onNotify?: (message: string, type: "success" | "info" | "warning" | "error") => void;
  /** Layout enxuto do chat: menu lateral + nova conversa */
  variant?: "default" | "chat";
  onOpenMenu?: () => void;
  onNewChat?: () => void;
}

export function Header({ userEmail, onNotify, variant = "default", onOpenMenu, onNewChat }: HeaderProps) {
  const pathname = usePathname();
  const { mode, isOnline } = useModelMode();
  const [isModeModalOpen, setIsModeModalOpen] = useState(false);
  const isChat = variant === "chat" || pathname === "/chat";

  const statusColor = getStatusColor(mode, isOnline);

  return (
    <>
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {isChat ? (
              <button
                type="button"
                onClick={onOpenMenu}
                className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--base)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Abrir menu e histórico"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
            <Link href="/" className="flex items-center gap-2 group min-w-0">
              <BrandMark size={isChat ? 24 : 28} />
              {!isChat ? (
                <div className="hidden sm:flex flex-col">
                  <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)]">
                    Plut<span className="text-[var(--selo)]">ão</span>
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] leading-none">
                    Missões · Evidência
                  </span>
                </div>
              ) : (
                <span className="text-sm font-medium text-[var(--text-primary)] hidden sm:inline truncate">
                  Chat
                </span>
              )}
            </Link>

            <nav className={`desktop-top-nav hidden md:flex items-center gap-1 text-xs ${isChat ? "md:hidden" : ""}`}>
              <Link
                href="/chat"
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  pathname === "/chat"
                    ? "bg-[var(--base)] text-[var(--selo)] font-medium border border-[var(--border)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--base)]"
                }`}
              >
                Chat
              </Link>
              <Link
                href="/cockpit"
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  pathname === "/cockpit"
                    ? "bg-[var(--base)] text-[var(--selo)] font-medium border border-[var(--border)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--base)]"
                }`}
              >
                Cockpit
              </Link>
              <Link
                href="/planos"
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  pathname === "/planos"
                    ? "bg-[var(--base)] text-[var(--selo)] font-medium border border-[var(--border)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--base)]"
                }`}
              >
                Planos
              </Link>
              <Link
                href="/configuracoes"
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  pathname === "/configuracoes"
                    ? "bg-[var(--base)] text-[var(--selo)] font-medium border border-[var(--border)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--base)]"
                }`}
              >
                Configurações
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {isChat && onNewChat ? (
              <button
                type="button"
                onClick={onNewChat}
                className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--base)] hover:text-[var(--selo)] transition-colors"
                aria-label="Nova conversa"
                title="Nova conversa"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setIsModeModalOpen(true)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border
                border-[var(--border)] bg-[var(--base)]/50 text-[var(--text-primary)]
                hover:border-[var(--selo)]/40 active:scale-95 transition-all cursor-pointer
              `}
              title="Modo de operação (Online / Híbrido / Offline)"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
              <span className="font-mono text-[10px] tracking-tight uppercase opacity-90">
                {mode === "auto" ? "Auto" : mode === "online" ? "Online" : "Offline"}
              </span>
            </button>

            {!isChat ? <ViewModeToggle /> : null}

            <UserMenu
              userEmail={userEmail}
              onOpenModeModal={() => setIsModeModalOpen(true)}
            />
          </div>
        </div>
      </header>

      <ModeControlModal
        isOpen={isModeModalOpen}
        onClose={() => setIsModeModalOpen(false)}
        onNotify={onNotify}
      />
    </>
  );
}
