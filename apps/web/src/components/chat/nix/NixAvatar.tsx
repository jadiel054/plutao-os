/**
 * Identidade visual da Nix — avatar próprio do agente (SVG puro, sem dependências).
 *
 * Não é a letra "P" e não reutiliza a imagem do bot de suporte: é uma marca
 * dedicada, com o verde original do Plutão e tons ciano/verde-água.
 *
 * Estrutura sustentável: variantes registradas em AVATAR_VARIANTS permitem,
 * no futuro, avatares selecionáveis com personalidade/foco próprios, sem
 * mudanças nos pontos de consumo.
 */

export type NixAvatarVariant = "nix-core";

type AvatarVariantSpec = {
  stops: Array<{ offset: string; color: string }>;
  core: string;
  satellite: string;
};

const AVATAR_VARIANTS: Record<NixAvatarVariant, AvatarVariantSpec> = {
  "nix-core": {
    stops: [
      { offset: "0%", color: "#7DFFB3" },
      { offset: "55%", color: "#4FF0D4" },
      { offset: "100%", color: "#22D3EE" },
    ],
    core: "#A7FFE0",
    satellite: "#22D3EE",
  },
};

type NixAvatarProps = {
  size?: number;
  className?: string;
  variant?: NixAvatarVariant;
};

export function NixAvatar({ size = 40, className = "", variant = "nix-core" }: NixAvatarProps) {
  const spec = AVATAR_VARIANTS[variant] ?? AVATAR_VARIANTS["nix-core"];
  const uid = "nix-" + variant + "-" + size;
  const gradId = uid + "-grad";
  const glowId = uid + "-glow";
  const blurId = uid + "-blur";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Nix"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          {spec.stops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={spec.core} stopOpacity="0.35" />
          <stop offset="100%" stopColor={spec.core} stopOpacity="0" />
        </radialGradient>
        <filter id={blurId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* núcleo de energia com halo */}
      <circle cx="32" cy="32" r="24" fill={"url(#" + glowId + ")"} />
      <circle cx="32" cy="32" r="7" fill={spec.core} filter={"url(#" + blurId + ")"} />

      {/* arcos orbitais (assinatura da Nix) */}
      <path d="M 14 32 A 18 18 0 0 1 32 14" stroke={"url(#" + gradId + ")"} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
      <path d="M 50 32 A 18 18 0 0 1 32 50" stroke={"url(#" + gradId + ")"} strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <path d="M 8 32 A 24 24 0 0 1 32 8" stroke={"url(#" + gradId + ")"} strokeWidth="1.75" strokeLinecap="round" opacity="0.4" />

      {/* satélite no arco externo */}
      <circle cx="53.5" cy="20.5" r="2.6" fill={spec.satellite} filter={"url(#" + blurId + ")"} />
    </svg>
  );
}
