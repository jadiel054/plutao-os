/** Plutão brand mark — planet + orbital ring + status (premium SVG) */

type BrandMarkProps = {
  size?: number;
  className?: string;
  variant?: "color" | "mono";
};

export function BrandMark({ size = 28, className = "", variant = "color" }: BrandMarkProps) {
  const id = `bm-${size}-${variant}`;
  const isMono = variant === "mono";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <radialGradient id={`${id}-planet`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor={isMono ? "#3a3f3c" : "#2a302c"} />
          <stop offset="55%" stopColor={isMono ? "#1a1e1c" : "#141816"} />
          <stop offset="100%" stopColor="#0a0c0b" />
        </radialGradient>
        <linearGradient id={`${id}-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isMono ? "#e8ece9" : "#b8ffe0"} />
          <stop offset="50%" stopColor={isMono ? "#f2f5f3" : "#7DFFB3"} />
          <stop offset="100%" stopColor={isMono ? "#a8b0ac" : "#3ecf8e"} />
        </linearGradient>
        <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse cx="32" cy="54" rx="16" ry="3" fill="#000" opacity="0.35" />

      <circle cx="32" cy="32" r="15" fill={`url(#${id}-planet)`} />
      <circle
        cx="32"
        cy="32"
        r="15"
        stroke={isMono ? "currentColor" : "#1E2421"}
        strokeWidth="1"
        opacity="0.9"
      />
      <ellipse cx="26" cy="26" rx="5" ry="3.5" fill="#fff" opacity="0.12" />

      <ellipse
        cx="32"
        cy="32"
        rx="24"
        ry="7"
        stroke={`url(#${id}-ring)`}
        strokeWidth="2.25"
        transform="rotate(-18 32 32)"
        filter={`url(#${id}-glow)`}
        opacity="0.95"
      />

      <circle
        cx="52"
        cy="27"
        r="2.4"
        fill={isMono ? "currentColor" : "#7DFFB3"}
        filter={`url(#${id}-glow)`}
      />
    </svg>
  );
}

type BrandLockupProps = {
  className?: string;
  markSize?: number;
  showWordmark?: boolean;
  showTagline?: boolean;
  stacked?: boolean;
};

export function BrandLockup({
  className = "",
  markSize = 28,
  showWordmark = true,
  showTagline = false,
  stacked = false,
}: BrandLockupProps) {
  if (stacked) {
    return (
      <div className={`flex flex-col items-center text-center gap-4 ${className}`}>
        <div className="relative flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full opacity-40 blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(125,255,179,0.25) 0%, transparent 70%)" }}
          />
          <BrandMark size={markSize} />
        </div>
        {showWordmark && (
          <div className="space-y-2">
            <div className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
              Plut<span className="text-[var(--selo)]">ão</span>
            </div>
            {showTagline && (
              <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] max-w-[300px] mx-auto leading-relaxed tracking-wide">
                Sistema Abraçado com o Esforço, Dedicação e Evolução
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={markSize} />
      {showWordmark && (
        <span className="font-semibold tracking-tight text-[var(--text-primary)] leading-none">
          Plut<span className="text-[var(--selo)]">ão</span>
        </span>
      )}
    </span>
  );
}
