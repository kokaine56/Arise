import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GlassButton } from '@/components/glass/GlassButton';
import { GlassInput } from '@/components/glass/GlassField';
import { IconCheck, IconMinus, IconPlus } from '@/components/ui/Icon';
import { cn, formatAmount } from '@/lib/format';

export interface NumericAdjustProps {
  actual: number;
  target: number;
  unit: string | null;
  step: number;
  onAdjust: (delta: number) => void;
  onCommit: (value: number) => void;
  onDone: () => void;
  goalName: string;
}

/**
 * Partial progress, entered without leaving the day.
 *
 * A stepper for the common case (one tap, one increment) and a direct field for
 * the common real case ("I did 1.5 km, not 1.2"). Values are committed
 * optimistically, so the ring behind this panel is already moving.
 */
export const NumericAdjust = ({
  actual,
  target,
  unit,
  step,
  onAdjust,
  onCommit,
  onDone,
  goalName,
}: NumericAdjustProps) => {
  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState<string>(String(actual));
  const inputRef = useRef<HTMLInputElement>(null);
  const committed = useRef(actual);

  // Keep the field in step with the stored value, including after a rollback.
  useEffect(() => {
    setDraft(String(actual));
    committed.current = actual;
  }, [actual]);

  const atTarget = actual >= target;
  const suffix = unit ?? '';

  const commitDraft = (): void => {
    const parsed = Number.parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed !== committed.current) {
      committed.current = parsed;
      onCommit(parsed);
    }
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="overflow-hidden"
    >
      <div className="flex flex-col gap-3 px-1 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <GlassButton
            size="md"
            aria-label={`Decrease ${goalName} by ${step}`}
            onClick={() => onAdjust(-step)}
            disabled={actual <= 0}
            className="aspect-square !px-0"
          >
            <IconMinus className="size-4" />
          </GlassButton>

          <div className="relative flex-1">
            <GlassInput
              ref={inputRef}
              numeric
              value={draft}
              aria-label={`${goalName} value`}
              suffix={suffix}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitDraft();
                  inputRef.current?.blur();
                }
              }}
              className="text-center"
            />
          </div>

          <GlassButton
            size="md"
            aria-label={`Increase ${goalName} by ${step}`}
            onClick={() => onAdjust(step)}
            className="aspect-square !px-0"
          >
            <IconPlus className="size-4" />
          </GlassButton>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="tabular text-caption text-muted">
            {formatAmount(actual)}
            {suffix ? ` ${suffix}` : ''} of {formatAmount(target)}
            {suffix ? ` ${suffix}` : ''}
          </p>
          <AnimatePresence mode="wait" initial={false}>
            {atTarget ? (
              <motion.span
                key="done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-caption font-medium text-accent"
              >
                <IconCheck className="size-3.5" />
                Target met
              </motion.span>
            ) : (
              <motion.button
                key="set"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  onAdjust(target - actual);
                  inputRef.current?.focus();
                }}
                className={cn(
                  'text-caption font-medium text-muted underline decoration-glass-border-strong',
                  'underline-offset-4 transition-colors hover:text-foreground',
                )}
              >
                Fill to {formatAmount(target)}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <GlassButton size="sm" variant="ghost" onClick={onDone} className="self-end">
          Done
        </GlassButton>
      </div>
    </motion.div>
  );
};
