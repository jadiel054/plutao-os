"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";

export interface TourStep {
  title: string;
  description: string;
  targetSelector: string | null;
  primaryButtonText?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Bem-vindo ao Plutão OS",
    description:
      "Seu cockpit pessoal: missões, agente de IA e arquivos. Tour de 30 segundos, pode pular quando quiser.",
    targetSelector: null,
  },
  {
    title: "Navegação",
    description: "Alterne entre conversar com o agente e ajustar seu sistema.",
    targetSelector: '[data-tour="nav-tabs"]',
  },
  {
    title: "Chat com o Agente",
    description: "Converse, peça tarefas e aprove ações. O agente executa ferramentas por você.",
    targetSelector: '[data-tour="open-chat"]',
  },
  {
    title: "Cockpit",
    description: "Seu centro de comando: missões, filesystem e visão geral em um só lugar.",
    targetSelector: '[data-tour="open-cockpit"]',
  },
  {
    title: "Configurações",
    description:
      "Conectores, preferências e integrações. Parte experimental: pode falhar, e tudo bem — seu feedback constrói o Plutão.",
    targetSelector: '[data-tour="settings-link"]',
  },
  {
    title: "Sua vez",
    description: "Explore o Plutão OS e crie sua primeira missão.",
    targetSelector: null,
    primaryButtonText: "Começar",
  },
];

const STORAGE_KEY = "plutao_onboarding_seen";
const FALLBACK_STORAGE_KEY = "onboarding_seen";

export function isOnboardingSeenInStorage(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return (
      localStorage.getItem(STORAGE_KEY) === "true" ||
      localStorage.getItem(FALLBACK_STORAGE_KEY) === "true"
    );
  } catch {
    return false;
  }
}

export function setOnboardingSeenInStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, "true");
    localStorage.setItem(FALLBACK_STORAGE_KEY, "true");
  } catch {
    // Ignore storage errors
  }
}

async function persistOnboardingSeenInApi(): Promise<void> {
  try {
    await fetch("/api/user/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_seen: true }),
    });
  } catch {
    // Silently ignore API errors
  }
}

// Hydration helper for window dimensions
function emptySubscribe() {
  return () => {};
}

export function GuidedTour() {
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // Function to dismiss tour and save flag
  const dismissTour = useCallback(
    (navigateOnFinish = false) => {
      setIsOpen(false);
      setOnboardingSeenInStorage();
      void persistOnboardingSeenInApi();

      if (navigateOnFinish) {
        if (pathname !== "/chat") {
          router.push("/chat");
        }
      }
    },
    [pathname, router]
  );

  // Check initialization conditions
  useEffect(() => {
    if (!isMounted) return;

    if (isOnboardingSeenInStorage()) {
      return;
    }

    let isSubscribed = true;

    async function checkUserAndPreferences() {
      try {
        const authRes = await fetch("/api/auth/me", { cache: "no-store" });
        if (!authRes.ok) {
          return;
        }

        const prefsRes = await fetch("/api/user/preferences", { cache: "no-store" });
        if (prefsRes.ok) {
          const prefsData = (await prefsRes.json()) as {
            preferences?: { onboarding_seen?: boolean };
          };
          if (prefsData?.preferences?.onboarding_seen === true) {
            setOnboardingSeenInStorage();
            return;
          }
        }

        if (isSubscribed) {
          setIsOpen(true);
          setCurrentStepIndex(0);
        }
      } catch {
        // In case of error checking user/preferences, do not display
      }
    }

    void checkUserAndPreferences();

    return () => {
      isSubscribed = false;
    };
  }, [isMounted]);

  // Handle current step transition and target detection / automatic skip
  useEffect(() => {
    if (!isOpen) return;

    if (currentStepIndex >= TOUR_STEPS.length) {
      dismissTour(false);
      return;
    }

    const step = TOUR_STEPS[currentStepIndex];
    if (!step) {
      dismissTour(false);
      return;
    }

    if (!step.targetSelector) {
      setTargetRect(null);
      return;
    }

    const element = document.querySelector(step.targetSelector);
    if (!element) {
      // Target element missing on this route/screen -> auto-skip step
      setCurrentStepIndex((prev) => prev + 1);
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      // Target element is hidden/collapsed -> auto-skip step
      setCurrentStepIndex((prev) => prev + 1);
      return;
    }

    setTargetRect(rect);
  }, [isOpen, currentStepIndex, dismissTour]);

  // Recalculate targetRect on resize or scroll
  useEffect(() => {
    if (!isOpen) return;

    function handleResizeOrScroll() {
      const step = TOUR_STEPS[currentStepIndex];
      if (step?.targetSelector) {
        const el = document.querySelector(step.targetSelector);
        if (el) {
          setTargetRect(el.getBoundingClientRect());
        }
      }
    }

    window.addEventListener("resize", handleResizeOrScroll, { passive: true });
    window.addEventListener("scroll", handleResizeOrScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll);
    };
  }, [isOpen, currentStepIndex]);

  // Lock scroll and handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dismissTour(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, dismissTour]);

  if (!isMounted || !isOpen) {
    return null;
  }

  const step = TOUR_STEPS[currentStepIndex] || TOUR_STEPS[0]!;
  const isLastStep = currentStepIndex === TOUR_STEPS.length - 1;
  const primaryButtonText =
    step.primaryButtonText ?? (isLastStep ? "Começar" : "Próximo");

  const handleNext = () => {
    if (isLastStep) {
      dismissTour(true);
    } else {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  // Compute card positioning styles
  const getCardStyle = (): React.CSSProperties => {
    if (!targetRect) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 9999,
      };
    }

    const padding = 12;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 380;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 600;

    const cardWidth = Math.min(340, viewportWidth - 32);
    let top = targetRect.bottom + padding;

    // If near bottom of screen, place popover above target element
    if (top + 200 > viewportHeight - 60) {
      top = Math.max(16, targetRect.top - 210);
    }

    let left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    left = Math.max(16, Math.min(viewportWidth - cardWidth - 16, left));

    return {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: `${cardWidth}px`,
      zIndex: 9999,
    };
  };

  const spotlightPadding = 8;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tour guiado"
      data-testid="guided-tour-overlay"
      className="fixed inset-0 z-[9990] select-none"
    >
      {/* SVG Mask Spotlight Overlay */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-auto z-[9991]"
        style={{ touchAction: "none" }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            {/* White covers whole screen */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black cuts out target hole */}
            {targetRect && (
              <rect
                x={targetRect.left - spotlightPadding}
                y={targetRect.top - spotlightPadding}
                width={targetRect.width + spotlightPadding * 2}
                height={targetRect.height + spotlightPadding * 2}
                rx="12"
                ry="12"
                fill="black"
              />
            )}
          </mask>
        </defs>

        {/* Translucent Backdrop */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.8)"
          mask="url(#tour-spotlight-mask)"
        />

        {/* Spotlight Accent Border */}
        {targetRect && (
          <rect
            x={targetRect.left - spotlightPadding}
            y={targetRect.top - spotlightPadding}
            width={targetRect.width + spotlightPadding * 2}
            height={targetRect.height + spotlightPadding * 2}
            rx="12"
            ry="12"
            fill="none"
            stroke="var(--selo, #10b981)"
            strokeWidth="2"
            className="transition-all duration-300"
          />
        )}
      </svg>

      {/* Popover Card (Balão) */}
      <div
        style={getCardStyle()}
        data-testid="tour-balloon"
        className="bg-[var(--surface,#121514)] border border-[var(--border,#222825)] text-[var(--text-primary,#f3f4f6)] rounded-2xl p-5 shadow-2xl transition-all duration-300 pointer-events-auto"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--selo,#10b981)] font-semibold bg-[var(--selo,#10b981)]/10 px-2 py-0.5 rounded-full border border-[var(--selo,#10b981)]/20">
            Passo {currentStepIndex + 1} de {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => dismissTour(false)}
            aria-label="Fechar tour"
            className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-muted,#6b7280)] hover:text-[var(--text-primary,#f3f4f6)] hover:bg-[var(--base,#0b0d0c)] transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <h3 className="text-base font-semibold text-[var(--text-primary,#f3f4f6)] mb-1.5 tracking-tight">
          {step.title}
        </h3>

        <p className="text-xs text-[var(--text-secondary,#9ca3af)] leading-relaxed mb-5">
          {step.description}
        </p>

        <div className="flex items-center justify-between gap-3">
          {!isLastStep ? (
            <button
              type="button"
              onClick={() => dismissTour(false)}
              className="px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary,#9ca3af)] hover:text-[var(--text-primary,#f3f4f6)] transition-colors cursor-pointer"
            >
              Pular tour
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={handleNext}
            className="px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--selo,#10b981)] text-black hover:bg-[var(--nucleo,#059669)] active:scale-95 transition-all shadow-md cursor-pointer"
          >
            {primaryButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}
