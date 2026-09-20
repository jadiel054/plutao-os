"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function UsagePill() {
  const [usage, setUsage] = useState<{
    plan: string;
    used: number;
    max: number | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.plan && data?.usage) {
          setUsage({
            plan: data.plan,
            used: data.usage.messages ?? 0,
            max: data.usage.maxMessages ?? null,
          });
        }
      })
      .catch(() => {});
  }, []);

  if (!usage || !usage.max) return null;

  // Show only on free / orbita_livre when usage is >= 50%
  const isFree = usage.plan === "free" || usage.plan === "orbita_livre";
  const ratio = usage.used / usage.max;

  if (!isFree || ratio < 0.5) return null;

  return (
    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-muted)] animate-in fade-in duration-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      <span>
        <strong className="text-[var(--text-primary)]">{usage.used}/{usage.max}</strong> mensagens em nuvem hoje
      </span>
      <Link href="/planos" className="text-[var(--selo)] hover:underline font-semibold ml-1">
        Upgrade
      </Link>
    </div>
  );
}
