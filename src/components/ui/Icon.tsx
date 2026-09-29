/**
 * Icons.
 *
 * Hand-drawn on a 24px grid with a 1.6px stroke, matching the typography's
 * weight. A general-purpose icon library would drag in a hundred glyphs the
 * product never shows; the brief also asks for a restrained interface, and
 * these are the only ones it needs.
 */

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps): IconProps => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
  ...props,
});

/** The completion mark: a circle that reads as a ring before it is filled. */
export const IconCheck = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4.5 12.5 9.5 17.5 19.5 7" />
  </svg>
);

/** Unchecked state, drawn at the same optical weight as IconCheck. */
export const IconCircle = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8.25" />
  </svg>
);

export const IconPlus = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 5.5v13M5.5 12h13" />
  </svg>
);

export const IconMinus = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M5.5 12h13" />
  </svg>
);

export const IconChevronLeft = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </svg>
);

export const IconChevronRight = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </svg>
);

export const IconChevronDown = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M5.5 9.5 12 16l6.5-6.5" />
  </svg>
);

export const IconClose = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
);

/** A single dot, sized to sit in a ring. Carries the completion state. */
export const IconDot = (props: IconProps) => (
  <svg {...base({ strokeWidth: 0, ...props })}>
    <circle cx="12" cy="12" r="3.5" fill="currentColor" />
  </svg>
);

export const IconAlert = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 8v4.5M12 15.75v.5" />
  </svg>
);

export const IconInfo = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 11.5V16M12 8v.5" />
  </svg>
);

export const IconSun = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="3.75" />
    <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18" />
  </svg>
);

export const IconMoon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />
  </svg>
);

export const IconMonitor = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="3.5" y="5" width="17" height="11.5" rx="2" />
    <path d="M9.5 20.5h5" />
  </svg>
);

export const IconList = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4.5 7h15M4.5 12h15M4.5 17h9" />
  </svg>
);

/** A horizon at dawn: the day's starting line, not a generic "home". */
export const IconToday = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M3 18h18M12 3.5v2M5.5 5.5 7 7M18.5 5.5 17 7" />
  </svg>
);

export const IconCalendar = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8.5 3.5v4M15.5 3.5v4" />
  </svg>
);

export const IconChart = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 19.5V10M10 19.5V5M16 19.5v-6M21 19.5H3" />
  </svg>
);

export const IconSettings = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="2.75" />
    <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
  </svg>
);

export const IconFlame = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 3.5s4.5 4 4.5 8a4.5 4.5 0 1 1-9 0c0-1.6.8-3 1.5-4 .3 1 .9 1.8 1.7 1.8 1.4 0 1.3-2.3 1.3-5.8Z" />
  </svg>
);

export const IconPause = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M9.5 5.5v13M14.5 5.5v13" />
  </svg>
);

export const IconPlay = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M8 5.5 18.5 12 8 18.5Z" />
  </svg>
);

export const IconArchive = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="3.5" y="4.5" width="17" height="4" rx="1.25" />
    <path d="M5.5 8.5v9.25a1.75 1.75 0 0 0 1.75 1.75h9.5a1.75 1.75 0 0 0 1.75-1.75V8.5M10 12.5h4" />
  </svg>
);

export const IconTrash = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4.5 7h15M9.5 7V5.25A1.25 1.25 0 0 1 10.75 4h2.5a1.25 1.25 0 0 1 1.25 1.25V7M6.5 7l.8 12.05A1.75 1.75 0 0 0 9.05 20.75h5.9a1.75 1.75 0 0 0 1.75-1.7L17.5 7" />
  </svg>
);

export const IconPencil = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4.5 19.5h3.2l9.1-9.1a2.26 2.26 0 0 0-3.2-3.2l-9.1 9.1v3.2Z" />
    <path d="M13.4 7.6l3.2 3.2" />
  </svg>
);

export const IconClock = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 7.5V12l3 1.75" />
  </svg>
);

export const IconRepeat = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4.5 9.5A4 4 0 0 1 8.5 5.5h8M16.5 14.5a4 4 0 0 1-4 4h-8" />
    <path d="M14 3l2.5 2.5L14 8M10 16l-2.5 2.5L10 21" />
  </svg>
);

export const IconSearch = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M15.75 15.75 20.5 20.5" />
  </svg>
);

export const IconLock = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="4.75" y="10.5" width="14.5" height="9.75" rx="2.25" />
    <path d="M8.25 10.5V8a3.75 3.75 0 0 1 7.5 0v2.5" />
  </svg>
);

export const IconLogout = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M14.5 4.5h3.25A2.25 2.25 0 0 1 20 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25H14.5" />
    <path d="M10 8l-4 4 4 4M6 12h9" />
  </svg>
);

export const IconDots = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="6" cy="12" r="1.15" />
    <circle cx="12" cy="12" r="1.15" />
    <circle cx="18" cy="12" r="1.15" />
  </svg>
);

export const IconTarget = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8.25" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

export const IconSparkle = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 4.25 13.6 9l4.75 1.6-4.75 1.6L12 17l-1.6-4.8L5.65 10.6 10.4 9Z" />
    <path d="M17.75 15.25l.7 2.05 2.05.7-2.05.7-.7 2.05-.7-2.05-2.05-.7 2.05-.7Z" />
  </svg>
);

