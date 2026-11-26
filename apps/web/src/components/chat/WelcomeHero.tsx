"use client";

import { useEffect, useState, type ReactNode } from "react";
import { NixAvatar } from "./nix/NixAvatar";
import {
  buildQuickActions,
  continuityLine,
  greetingFor,
  type QuickAction,
  type QuickActionKind,
  type WelcomeContext,
} from "@/lib/chat/nixWelcome";

type WelcomeHeroProps = {
  agentName: string;
  agentIdentity: string;
  context: WelcomeContext;
  localMode?: boolean;
  onSelectAction: (prompt: string, missionId?: string) => void;
};

const KIND_ICONS: Record<QuickActionKind, ReactNode> = {
  mission: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="5" />
    </svg>
  ),
  conversation: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
    </svg>
  ),
  project: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  tasks: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  ),
  overview: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
};

/**
 * Tela inicial do chat: hierarquia clara (avatar/greeting, continuidade,
 * ações rápidas) com a caixa de mensagem como foco principal logo abaixo.
 * Cards sem bordas visíveis, superfícies discretas, responsivo.
 */
export function WelcomeHero({ agentName, agentIdentity, context, localMode = false, onSelectAction }: WelcomeHeroProps) {
  // Saudação calculada no cliente (horário local) após a montagem para
  // evitar divergência de hidratação.
  const [greeting, setGreeting] = useState("Olá. Eu sou " + agentName + ".");
  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours(), agentName));
  }, [agentName]);

  const actions: QuickAction[] = buildQuickActions(context);
  const continuity = continuityLine(context);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-1 py-8 text-center sm:py-12">
      <div className="relative flex items-center justify-center">
        <div className="nix-hero-glow absolute inset-0 rounded-full blur-2xl" aria-hidden
          style={{ background: "radial-gradient(circle, rgba(79,240,212,0.28) 0%, transparent 70%)" }} />
        <NixAvatar size={64} className="relative" />
      </div>

      <h2 className="mt-5 max-w-md text-xl font-semibold leading-snug text-[var(--text-primary)] sm:text-2xl">
        {greeting}
      </h2>

      {continuity ? (
        <p className="mt-2 max-w-md text-xs text-[var(--selo)]">{continuity}</p>
      ) : null}

      <p className="mt-2 max-w-md text-xs text-[var(--text-secondary)]">{agentIdentity}</p>
      <p className="mt-1 max-w-md text-[11px] text-[var(--text-muted)]">
        {localMode
          ? "Modo Local Ativo: as respostas serão geradas diretamente no seu dispositivo."
          : "Conversa livre ou projeto: descubro a intenção, alinho o caminho e só então executo."}
      </p>

      {actions.length > 0 ? (
        <div className="mt-7 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Ações rápidas">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelectAction(a.prompt, a.missionId)}
              className="group flex cursor-pointer items-start gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-elevated)]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--selo)]/50"
            >
              <span className="mt-0.5 shrink-0 text-[var(--selo)] transition-transform group-hover:scale-110" aria-hidden>
                {KIND_ICONS[a.kind]}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{a.label}</span>
                <span className="block truncate text-[11px] text-[var(--text-muted)]">{a.description}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
