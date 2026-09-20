"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";

export function MobileNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Home", kind: "home" as const },
    { href: "/chat", label: "Chat", kind: "chat" as const },
    { href: "/cockpit", label: "Cockpit", kind: "cockpit" as const },
    { href: "/planos", label: "Planos", kind: "planos" as const },
    { href: "/configuracoes", label: "Config", kind: "config" as const },
  ];

  return (
    <nav className="mobile-bottom-nav sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface)]/95 backdrop-blur-md border-t border-[var(--border)] px-2 py-1.5 shadow-lg">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl min-w-[52px] transition-colors ${
                isActive
                  ? "text-[var(--selo)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {item.kind === "home" ? (
                <BrandMark size={20} className={isActive ? "" : "opacity-70"} />
              ) : (
                <span className="text-[11px] font-semibold tracking-wide uppercase opacity-90 h-5 flex items-center">
                  {item.kind === "chat" ? "Chat" : item.kind === "cockpit" ? "Ckpt" : item.kind === "planos" ? "Planos" : "Cfg"}
                </span>
              )}
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
