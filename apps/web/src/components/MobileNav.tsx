"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Home", icon: "🏠" },
    { href: "/chat", label: "Chat", icon: "💬" },
    { href: "/cockpit", label: "Cockpit", icon: "📊" },
    { href: "/configuracoes", label: "Config", icon: "⚙️" },
  ];

  return (
    <nav className="mobile-bottom-nav sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface)]/95 backdrop-blur-md border-t border-[var(--border)] px-2 py-1.5 shadow-lg">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[4rem] ${
                isActive
                  ? "text-[var(--selo)] bg-[var(--base)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
