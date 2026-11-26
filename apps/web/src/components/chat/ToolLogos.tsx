"use client";

import type { ReactElement } from "react";
import { toolLogoFor, type ToolLogoId } from "@/lib/chat/toolLogos";

function GithubMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function VercelMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3.5l9.5 16.5h-19L12 3.5z" />
    </svg>
  );
}

function NeonMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5.5 19V5l13 14V5" stroke="#00E599" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrowserMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="9.5" />
      <ellipse cx="12" cy="12" rx="4.25" ry="9.5" />
      <path d="M2.5 12h19M3.8 7h16.4M3.8 17h16.4" strokeLinecap="round" />
    </svg>
  );
}

function GenericMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M13 2.5L4.5 14H11l-1 7.5L18.5 10H12l1-7.5z" strokeLinejoin="round" />
    </svg>
  );
}

const MARKS: Record<ToolLogoId, (p: { size: number }) => ReactElement> = {
  github: GithubMark,
  vercel: VercelMark,
  neon: NeonMark,
  browser: BrowserMark,
  generic: GenericMark,
};

type ToolLogoProps = {
  provider: string;
  size?: number;
  className?: string;
};

/**
 * Identidade visual oficial da ferramenta usada pelo agente.
 * Renderiza a marca do provedor quando conhecida, com fallback generico.
 */
export function ToolLogo({ provider, size = 14, className }: ToolLogoProps) {
  const id = toolLogoFor(provider);
  const Mark = MARKS[id];
  return (
    <span className={`inline-flex items-center justify-center shrink-0 ${id === "neon" ? "" : "text-current"} ${className ?? ""}`} title={provider}>
      <Mark size={size} />
    </span>
  );
}
