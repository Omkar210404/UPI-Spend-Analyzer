import type { ComponentChildren } from 'preact';

function Svg({ children, size = 18 }: { children: ComponentChildren; size?: number }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const UploadIcon = () => (
  <Svg size={22}>
    <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </Svg>
);

export const ShieldIcon = () => (
  <Svg>
    <path d="M12 3 5 6v5c0 4.4 2.9 8.3 7 10 4.1-1.7 7-5.6 7-10V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const SunIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const MoonIcon = () => (
  <Svg>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
  </Svg>
);

export const DownloadIcon = () => (
  <Svg>
    <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />
  </Svg>
);

export const ChevronIcon = () => (
  <Svg size={16}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const CloseIcon = () => (
  <Svg size={14}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const ArrowUpIcon = () => (
  <Svg size={16}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);

export const ArrowDownIcon = () => (
  <Svg size={16}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);

export const FlagIcon = () => (
  <Svg size={16}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Svg>
);

export function Logo() {
  return (
    <svg
      class="logo"
      width="28"
      height="28"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="7" class="logo-tile" />
      <path d="M8 22V12.5M14 22V9M20 22v-6.5" class="logo-bars" />
      <circle cx="24.5" cy="9.5" r="2.5" class="logo-dot" />
    </svg>
  );
}
