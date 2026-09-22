"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface UserMenuProps {
  userEmail?: string;
  onOpenModeModal?: () => void;
}

export function UserMenu({ userEmail, onOpenModeModal }: UserMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch {
      router.replace("/login");
    } finally {
      setLoggingOut(false);
    }
  };

  const initial = userEmail ? userEmail.charAt(0).toUpperCase() : "U";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-[var(--surface)] transition-colors border border-transparent hover:border-[var(--border)] cursor-pointer"
        aria-label="Menu do usuário"
      >
        <div className="w-7 h-7 rounded-full bg-[var(--selo)] text-[var(--base)] font-bold text-xs flex items-center justify-center shrink-0">
          {initial}
        </div>
        <span className="text-xs font-mono text-[var(--text-secondary)] hidden sm:inline max-w-[120px] truncate">
          {userEmail || "Usuário"}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">▼</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop Scrim para cobrir o conteúdo atrás do menu */}
          <div
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div className="absolute right-0 mt-2 w-56 bg-[var(--surface-elevated)]/95 border border-[var(--border)] rounded-2xl shadow-2xl py-2 z-50 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="px-4 py-2 border-b border-[var(--border)]">
              <p className="text-[10px] uppercase font-mono text-[var(--text-muted)]">Conectado como</p>
              <p className="text-xs font-medium text-[var(--text-primary)] truncate">{userEmail || "Sessão Ativa"}</p>
            </div>

            <div className="py-1">
              <Link
                href="/configuracoes"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--base)]/60 transition-colors"
              >
                ⚙️ Configurações & Conta
              </Link>

              {onOpenModeModal && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenModeModal();
                  }}
                  className="w-full text-left flex items-center gap-2 px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--base)]/60 transition-colors cursor-pointer"
                >
                  ⚡ Modo de IA
                </button>
              )}
            </div>

            <div className="pt-1 border-t border-[var(--border)]">
              <button
                type="button"
                disabled={loggingOut}
                onClick={handleLogout}
                className="w-full text-left flex items-center gap-2 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loggingOut ? (
                  <>
                    <span className="w-3 h-3 rounded-full border-2 border-red-400/30 border-t-red-400 animate-spin" />
                    Saindo...
                  </>
                ) : (
                  <>🚪 Sair da conta</>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
