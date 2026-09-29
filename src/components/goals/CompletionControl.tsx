import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/format';

export interface CompletionControlProps {
  completed: boolean;
  onToggle: () => void;
  /** Announced to screen readers, e.g. "Walk, 3 kilometres, completed". */
  label: string;
  disabled?: boolean | undefined;
  /** True while the write is in flight: acknowledged, but not yet confirmed. */
  pending?: boolean | undefined;
  size?: 'md' | 'sm';
}

/**
 * The single most important control in the product.
 *
 * 44×44px of touch target around a 26px ring — big enough to hit without
 * looking, small enough that a list of them stays calm. The tick is drawn by
 * animating the path length rather than swapping a glyph, which is what makes
 * the circle feel like it *becomes* a check rather than changing state.
 */
export const CompletionControl = ({
  completed,
  onToggle,
  label,
  disabled = false,
  pending = false,
  size = 'md',
}: CompletionControlProps) => {
  const reduceMotion = useReducedMotion();
  const target = 44;
  const ring = size === 'md' ? 26 : 20;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={completed}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      // The row itself is not a button, so the control must not submit or
      // bubble its click into a parent row action.
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full',
        'transition-transform duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]',
        'active:scale-90 disabled:opacity-60',
      )}
      style={{ width: target, height: target, marginLeft: -9 }}
    >
      <span
        aria-hidden
        className={cn(
          'absolute grid place-items-center rounded-full border transition-all duration-200',
          'ease-[cubic-bezier(0.32,0.72,0,1)]',
          completed
            ? 'border-transparent bg-accent'
            : 'border-glass-border-strong bg-glass-sunken hover:border-accent/45 hover:bg-glass',
        )}
        style={{ width: ring, height: ring }}
      />
      <motion.svg
        aria-hidden
        width={ring}
        height={ring}
        viewBox="0 0 24 24"
        fill="none"
        className="relative z-10"
        initial={false}
        animate={{ rotate: completed && !reduceMotion ? [0, -8, 0] : 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.32, 0.72, 0, 1] }}
      >
        <motion.path
          d="M5.5 12.6 10 17 18.5 7.4"
          stroke="var(--accent-contrast)"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: completed ? 1 : 0, opacity: completed ? 1 : 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { pathLength: { duration: 0.26, ease: [0.32, 0.72, 0, 1] }, opacity: { duration: 0.12 } }
          }
        />
      </motion.svg>
      {pending ? (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent/70 animate-spin [animation-duration:1.1s] motion-reduce:hidden"
        />
      ) : null}
    </button>
  );
};
