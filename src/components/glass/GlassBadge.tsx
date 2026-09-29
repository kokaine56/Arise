import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/format';
import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'warning' | 'danger';

const TONE: Record<BadgeTone, string> = {
  neutral: 'text-muted bg-glass',
  accent: 'text-accent bg-accent-quiet',
  warning: 'text-warning bg-warning-quiet',
  danger: 'text-danger bg-danger-quiet',
};

export const Badge = ({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone | undefined;
  children: ReactNode;
  className?: string | undefined;
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] px-2 py-1 text-micro font-medium',
      'tracking-wide',
      TONE[tone],
      className,
    )}
  >
    {children}
  </span>
);

/* -------------------------------------------------------------------------- */
/* Segmented control                                                          */
/* -------------------------------------------------------------------------- */

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Announced in place of the visible label, when the label is an icon. */
  ariaLabel?: string | undefined;
}

export interface SegmentedControlProps<T extends string | number> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md';
  className?: string | undefined;
}

/**
 * A single-choice control rendered as one sunken glass track with a sliding
 * indicator. Used for goal type, repeat pattern and appearance — choices that
 * benefit from seeing all the options at once.
 *
 * Implemented as a radiogroup so arrow keys and screen readers behave natively.
 */
export const SegmentedControl = <T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: SegmentedControlProps<T>) => {
  const reduceMotion = useReducedMotion();
  const height = size === 'sm' ? 'h-8' : 'h-10';

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('glass--sunken flex w-full gap-1 rounded-[var(--radius-control)] p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex-1 rounded-[calc(var(--radius-control)-0.25rem)] px-2 text-center',
              'text-caption font-medium transition-colors duration-200',
              height,
              'grid place-items-center',
              selected ? 'text-foreground' : 'text-subtle hover:text-muted',
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`segmented-${label}`}
                className="absolute inset-0 rounded-[calc(var(--radius-control)-0.25rem)] bg-glass-strong border border-glass-border"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 420, damping: 36 }
                }
                aria-hidden
              />
            ) : null}
            <span className="relative z-10 truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Switch                                                                     */
/* -------------------------------------------------------------------------- */

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string | undefined;
  disabled?: boolean | undefined;
}

/** A real checkbox underneath, so keyboard and form behaviour are free. */
export const Switch = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: SwitchProps) => (
  <label
    className={cn(
      'flex items-start justify-between gap-4 py-1',
      disabled ? 'opacity-50' : 'cursor-pointer',
    )}
  >
    <span className="min-w-0">
      <span className="block text-body text-foreground">{label}</span>
      {description ? (
        <span className="mt-0.5 block text-caption text-muted">{description}</span>
      ) : null}
    </span>
    <span className="relative mt-0.5 shrink-0">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'block h-6 w-11 rounded-full border transition-colors duration-200',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]',
          checked ? 'border-transparent bg-accent' : 'border-glass-border bg-glass-sunken',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-foreground shadow-sm transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      />
    </span>
  </label>
);
