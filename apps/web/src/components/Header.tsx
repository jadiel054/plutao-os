"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useModelMode, getStatusColor, getStatusLabel } from "@/hooks/useModelMode";
import { UserMenu } from "@/components/UserMenu";
import { ModeControlModal } from "@/components/ModeControlModal";
import { ViewModeToggle } from "@/components/ViewModeToggle";
import { BrandMark } from "@/components/BrandMark";

export interface HeaderProps {
  userEmail?: string;
  onNotify?: (message: string, type: "success" | "info" | "warning" | "error") => void;
}

export function Header({ userEmail, onNotify }: HeaderProps) {
  const pathname = usePathname();
  const { mode, isOnline, webGPUSupported } = useModelMode();
  const [isModeModalOpen, setIsModeModalOpen] = useState(false);

  const statusColor = getStatusColor(mode, isOnline);
  const statusLabel = getStatusLabel(mode, isOnline, webGPUSupported);

  return (
    <>
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <BrandMark size={28} />
              <div className="hidden sm:flex flex-col">
                <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)]">
                  Plut<span className="text-[var(--selo)]">ão</span>
                </span>
                <span className="text-[10px] text-[var(--text-muted)] leading-none">
                  Missões · Evidência
                </span>
              </div>
            </Link>

            <nav className="desktop-top-nav hidden md:flex items-center gap-1 text-xs">
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

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setIsModeModalOpen(true)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-medium
                ${statusColor}
                hover:opacity-90 active:scale-95 transition-all shadow-xs cursor-pointer
              `}
              title="Clique para alterar modo de operação (Online / Híbrido / Offline)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-90" />
              <span className="font-mono text-[11px] tracking-tight">{statusLabel}</span>
            </button>

            <ViewModeToggle />

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
