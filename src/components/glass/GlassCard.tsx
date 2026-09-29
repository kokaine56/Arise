import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/format';

export type GlassElevation = 'base' | 'raised' | 'sunken' | 'flat';

const ELEVATION: Record<GlassElevation, string> = {
  base: '',
  raised: 'glass--strong',
  sunken: 'glass--sunken',
  /** No blur at all. For large surfaces on low-power devices. */
  flat: 'bg-glass border border-glass-border',
};

export interface GlassCardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType | undefined;
  elevation?: GlassElevation | undefined;
  /** Adds a hover response. Only for cards that are themselves actionable. */
  interactive?: boolean | undefined;
  children: ReactNode;
}

/**
 * The base surface. Every panel in the product is one of these — the glass
 * recipe itself lives in `styles/globals.css`, never here, so blur, sheen and
 * shadow are tuned in exactly one place.
 */
export const GlassCard = ({
  as: Tag = 'div',
  elevation = 'base',
  interactive = false,
  className,
  children,
  ...rest
}: GlassCardProps) => (
  <Tag
    className={cn(
      'glass',
      ELEVATION[elevation],
      interactive && 'glass--hover',
      elevation === 'flat' && 'shadow-none backdrop-filter-none',
      className,
    )}
    {...rest}
  >
    {children}
  </Tag>
);

/**
 * A row inside a card, separated by a hairline rather than its own surface.
 * This is what keeps the day's checklist reading as one object instead of a
 * stack of floating cards — and it removes a backdrop-filter layer per row,
 * which matters a great deal on a phone.
 */
export const GlassRow = ({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('hairline relative', className)} {...rest}>
    {children}
  </div>
);

/** Small uppercase label that introduces a section of a card. */
export const SectionLabel = ({
  children,
  className,
  action,
}: {
  children: ReactNode;
  className?: string | undefined;
  action?: ReactNode | undefined;
}) => (
  <div className={cn('flex items-baseline justify-between gap-3', className)}>
    <h2 className="eyebrow">{children}</h2>
    {action}
  </div>
);
