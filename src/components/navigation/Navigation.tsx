import { NavLink } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/format';
import {
  IconCalendar,
  IconChart,
  IconList,
  IconSettings,
  IconToday,
} from '@/components/ui/Icon';
import type { ComponentType, SVGProps } from 'react';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Marks the tab that answers "what do I need to do today?". */
  primary?: boolean;
}

/** Five destinations, no more. The product answers one question at a time. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Today', icon: IconToday, primary: true },
  { to: '/goals', label: 'Goals', icon: IconList },
  { to: '/history', label: 'History', icon: IconCalendar },
  { to: '/insights', label: 'Insights', icon: IconChart },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

const isActive = (pathname: string, to: string): boolean =>
  to === '/' ? pathname === '/' : pathname.startsWith(to);

/**
 * Bottom navigation for phones.
 *
 * A premium liquid-glass dock fixed to the bottom of the viewport. The glass
 * material — blur, refraction, sheen — is defined entirely in CSS via the
 * `.nav-glass` class in `globals.css`, so this component stays declarative.
 *
 * The active indicator is a translucent frosted capsule rather than a solid
 * button, creating a "glass inside glass" effect.
 */
export const BottomNav = ({ pathname }: { pathname: string }) => {
  const reduceMotion = useReducedMotion();

  return (
    <nav
      aria-label="Primary"
      className="nav-glass fixed inset-x-0 bottom-0 z-40 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="relative z-10 mx-auto grid max-w-md grid-cols-5 px-1 py-1.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.to);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)]',
                'transition-colors duration-200',
                active ? 'text-accent' : 'text-subtle hover:text-muted',
              )}
            >
              {active ? (
                <motion.span
                  layoutId="bottom-nav-capsule"
                  aria-hidden
                  className="nav-active-capsule absolute inset-1"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 380, damping: 34 }
                  }
                />
              ) : null}
              <Icon className="relative z-10 size-[20px]" />
              <span className="relative z-10 text-[10px] font-medium leading-none tracking-wide">
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

/**
 * Desktop navigation: a compact rail rather than a wide sidebar, so the
 * dashboard keeps its horizontal room and the page stays centred.
 */
export const SideNav = ({ pathname }: { pathname: string }) => {
  const reduceMotion = useReducedMotion();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col items-center gap-1 px-3 py-5 md:flex"
    >
      <Wordmark className="mb-4" />
      <div className="glass flex w-full flex-col items-center gap-1 rounded-[var(--radius-glass)] p-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.to);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              className={cn(
                'relative flex size-11 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)]',
                'transition-colors duration-200',
                active ? 'text-accent' : 'text-subtle hover:bg-glass-hover hover:text-muted',
              )}
            >
              {active ? (
                <motion.span
                  layoutId="side-nav-indicator"
                  aria-hidden
                  className="absolute left-0 h-6 w-0.5 rounded-full bg-accent"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 420, damping: 36 }
                  }
                />
              ) : null}
              <Icon className="size-5" />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

/**
 * The mark: a ring that closes into a check. It is the same gesture as
 * completing a goal, which is the whole identity in one glyph.
 */
export const Wordmark = ({ className }: { className?: string }) => (
  <div className={cn('flex flex-col items-center gap-1', className)}>
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden fill="none">
      <circle cx="12" cy="12" r="9" stroke="var(--glass-border-strong)" strokeWidth="1.4" />
      <motion.circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="56.5"
        initial={{ strokeDashoffset: 14 }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
        transform="rotate(-90 12 12)"
        pathLength={40}
      />
      <path
        d="M8.5 12.4 11 15l4.5-5"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    <span className="font-[family-name:var(--font-display)] text-caption font-medium tracking-wide text-foreground">
      Arise
    </span>
  </div>
);
