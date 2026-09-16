/** Plutão brand mark — planet + orbital ring + status dot */

type BrandMarkProps = {
  size?: number;
  className?: string;
  variant?: "color" | "mono";
};

export function BrandMark({ size = 28, className = "", variant = "color" }: BrandMarkProps) {
  const stroke = variant === "mono" ? "currentColor" : "#7DFFB3";
  const planet = variant === "mono" ? "none" : "#141816";
  const planetStroke = variant === "mono" ? "currentColor" : "#1E2421";

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
      <circle cx="32" cy="32" r="14" fill={planet} stroke={planetStroke} strokeWidth="2" />
      <ellipse
        cx="32"
        cy="32"
        rx="22"
        ry="6"
        stroke={stroke}
        strokeWidth="1.75"
        transform="rotate(-18 32 32)"
      />
      <circle cx="50" cy="28" r="2.2" fill={stroke} />
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
      <div className={`flex flex-col items-center text-center gap-3 ${className}`}>
        <BrandMark size={markSize} />
        {showWordmark && (
          <div className="space-y-1.5">
            <div className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
              Plut<span className="text-[var(--selo)]">ão</span>
            </div>
            {showTagline && (
              <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] max-w-[280px] leading-relaxed font-normal tracking-wide">
                Sistema Abraçado com o Esforço, Dedicação e Evolução
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandMark size={markSize} />
      {showWordmark && (
        <span className="font-semibold tracking-tight text-[var(--text-primary)] leading-none">
          Plut<span className="text-[var(--selo)]">ão</span>
        </span>
      )}
    </span>
  );
}
