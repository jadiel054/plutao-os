/**
 * Plutão Icons — Set único de ícones SVG (1.5px stroke, 20px, currentColor)
 * Substitui todos os emojis da interface
 */

import type { SVGProps } from "react";

const iconProps: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  'aria-hidden': true,
};

export const ArrowUpIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export const StopIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);

export const SendIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

export const CopyIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const ShareIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </svg>
);

export const VolumeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
  </svg>
);

export const VolumeOffIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 0 0 7M19 5a9 9 0 0 0 0 14" />
    <path d="M23 9l-2 2-2-2" />
    <path d="M17 15l2-2 2 2" />
  </svg>
);

export const RegenerateIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
  </svg>
);

export const ThumbsUpIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M7 11v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z" />
    <path d="M7 11V8a4 4 0 0 1 4-4l1 5h5a2 2 0 0 1 2 2l-1 6a2 2 0 0 1-2 2h-7" />
  </svg>
);

export const ThumbsDownIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M17 13V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3z" />
    <path d="M17 13v3a4 4 0 0 1-4 4l-1-5H7a2 2 0 0 1-2-2l1-6a2 2 0 0 1 2-2h7" />
  </svg>
);

export const LightningIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

export const TestTubeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M9 2v6h6V2M9 8a4 4 0 0 0 4 4v6h-2v-4" />
    <path d="M19 8h2" />
  </svg>
);

export const EyeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
  </svg>
);

export const CloudIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 10a4 4 0 1 1-8 0" />
  </svg>
);

export const CpuIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3" />
    <path d="M1 9h3M1 15h3M20 9h3M20 15h3" />
  </svg>
);

export const StarIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

export const CheckCircleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const XCircleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M15 9l-6 6M9 9l6 6" />
  </svg>
);

export const PlayIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M5 3v18l14-9L5 3z" />
  </svg>
);

export const PauseIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

export const DownloadIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);

export const UploadIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5" />
    <path d="M12 3v12" />
  </svg>
);

export const TrashIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2z" />
  </svg>
);

export const PlusIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const XIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const FileIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

export const FileTextIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h5" />
  </svg>
);

export const ImageIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 16l5-5 5 5 5-5" />
    <path d="M19 9l-5 5-5-5" />
  </svg>
);

export const CodeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
  </svg>
);

export const ServerIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <rect x="2" y="2" width="20" height="8" rx="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" />
    <path d="M6 6v8M11 6v8M16 6v8" />
  </svg>
);

export const LinkIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export const GitHubIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

export const ExternalLinkIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6M10 14L21 3" />
  </svg>
);

export const GearIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const BellIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export const MenuIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </svg>
);

export const RingIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <circle cx="12" cy="12" r="10" />
  </svg>
);

export const MessageSquareIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const HomeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 22V12h6v10" />
  </svg>
);

export const UsersIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
