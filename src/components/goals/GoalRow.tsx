import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CompletionControl } from '@/components/goals/CompletionControl';
import { NumericAdjust } from '@/components/goals/NumericAdjust';
import { ProgressBar } from '@/components/glass/GlassProgress';
import { Badge } from '@/components/glass/GlassBadge';
import { GlassRow } from '@/components/glass/GlassCard';
import { IconClock } from '@/components/ui/Icon';
import { suggestStep } from '@/lib/goals/completion';
import { isOverdue } from '@/lib/goals/resolve';
import { formatAmount, pluralise } from '@/lib/format';
import { formatClock, formatClockCompact, type CivilDate } from '@/lib/date/civil';
import type { ResolvedGoal } from '@/types/goal';

export interface GoalRowProps {
  goal: ResolvedGoal;
  categoryLabel: string | undefined;
  timeZone: string;
  /** The civil date this row represents. Needed for deadline checks. */
  date: CivilDate;
  now?: Date | undefined;
  pending?: boolean | undefined;
  /** Past days are read-only: history is a record, not a to-do list. */
  readOnly?: boolean | undefined;
  /** Unused when `readOnly`; the control renders inert. */
  onToggle?: (() => void) | undefined;
  onAdjust?: (delta: number) => void;
  onCommit?: (value: number) => void;
}

/** Screen-reader phrasing for the completion control. */
const describe = (goal: ResolvedGoal): string => {
  if (goal.type === 'duration') {
    return `${goal.name}, ${formatAmount(goal.actual)} of ${formatAmount(goal.target ?? 0)} minutes`;
  }
  if (goal.target !== null) {
    return `${goal.name}, ${formatAmount(goal.actual)} of ${formatAmount(goal.target)}${goal.unit ? ` ${goal.unit}` : ''}`;
  }
  return goal.name;
};

/**
 * One line of the day.
 *
 * Rows sit inside a single glass surface and are separated by hairlines, so the
 * checklist reads as one object rather than a stack of floating cards. It also
 * means one `backdrop-filter` for the whole list instead of one per row, which
 * is the difference between smooth and janky on a mid-range phone.
 */
export const GoalRow = ({
  goal,
  categoryLabel,
  timeZone,
  date,
  now,
  pending = false,
  readOnly = false,
  onToggle,
  onAdjust,
  onCommit,
}: GoalRowProps) => {
  const reduceMotion = useReducedMotion();
  const isMeasured = goal.target !== null && goal.target > 0;
  const [expanded, setExpanded] = useState(false);
  const canExpand = isMeasured && !readOnly && onAdjust !== undefined && onCommit !== undefined;

  const overdue =
    goal.type === 'time' &&
    !goal.completed &&
    isOverdue(goal, { date, timeZone, ...(now !== undefined && { now }) });

  return (
    <GlassRow className="px-3.5 py-3.5 sm:px-4">
      <div className="flex items-center gap-1">
        {!readOnly && onToggle !== undefined ? (
          <CompletionControl
            completed={goal.completed}
            onToggle={onToggle}
            label={describe(goal)}
            pending={pending}
          />
        ) : (
          <span
            aria-hidden
            className="grid size-[44px] shrink-0 place-items-center"
            style={{ marginLeft: -9 }}
          >
            <span
              className={
                goal.completed
                  ? 'size-[22px] rounded-full border border-accent bg-accent'
                  : 'size-[22px] rounded-full border border-glass-border'
              }
            />
          </span>
        )}

        {/*
          The body is a button only when it does something. For a checkbox or a
          deadline there is nothing to open, so it stays a plain div and the row
          keeps exactly one interactive element.
        */}
        {canExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="min-w-0 flex-1 rounded-[var(--radius-chip)] py-1 text-left"
          >
            <RowLabel goal={goal} />
          </button>
        ) : (
          <div className="min-w-0 flex-1 py-1">
            <RowLabel goal={goal} />
          </div>
        )}

        <div className="flex shrink-0 flex-col items-end gap-1 pr-1">
          <span className="text-micro text-subtle">{categoryLabel ?? ''}</span>
          {goal.type === 'time' && goal.targetTime ? (
            <span
              className={
                goal.isLate
                  ? 'text-micro text-warning'
                  : overdue
                    ? 'text-micro text-subtle'
                    : 'text-micro text-muted'
              }
            >
              {goal.isLate ? 'after' : 'by'} {formatClockCompact(goal.targetTime)}
            </span>
          ) : null}
        </div>
      </div>

      {isMeasured ? (
        <div className="ml-[35px] mt-2 pr-1">
          <ProgressBar
            value={goal.progress}
            label={`${goal.name} progress`}
            className={goal.completed ? 'opacity-0' : undefined}
          />
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {expanded && canExpand ? (
          <NumericAdjust
            actual={goal.actual}
            target={goal.target ?? 0}
            unit={goal.unit}
            step={suggestStep(goal.goal)}
            goalName={goal.name}
            onAdjust={onAdjust}
            onCommit={onCommit}
            onDone={() => setExpanded(false)}
          />
        ) : null}
      </AnimatePresence>

      {goal.isLate ? (
        <motion.p
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="ml-[35px] mt-1.5 flex items-center gap-1.5 text-micro text-warning"
        >
          <IconClock className="size-3" />
          Done after {formatClock(goal.targetTime).toLowerCase()} — still counts
        </motion.p>
      ) : null}
    </GlassRow>
  );
};

/**
 * Name on top, achievement underneath. Numbers are tabular so the row does not
 * shift sideways as they change.
 */
const RowLabel = ({ goal }: { goal: ResolvedGoal }) => {
  const isMeasured = goal.target !== null && goal.target > 0;

  return (
    <>
      <p
        className={
          goal.completed
            ? 'truncate text-body text-muted'
            : 'truncate text-body text-foreground'
        }
      >
        {goal.name}
      </p>

      {isMeasured ? (
        <p className="tabular mt-0.5 text-caption">
          <span className={goal.completed ? 'text-accent' : 'text-foreground'}>
            {formatAmount(goal.actual)}
          </span>
          <span className="text-subtle">
            {' / '}
            {formatAmount(goal.target ?? 0)}
            {goal.unit ? ` ${goal.unit}` : ''}
          </span>
        </p>
      ) : goal.type === 'time' && goal.targetTime ? (
        <p className="mt-0.5 text-caption text-muted">
          {goal.completed ? 'Recorded' : 'Not yet recorded'}
        </p>
      ) : null}
    </>
  );
};

/** Used by history and the weekly strip, where rows must not be interactive. */
export const GoalStatusPill = ({ goal }: { goal: ResolvedGoal }) => {
  if (goal.completed) return <Badge tone="accent">Done</Badge>;
  if (goal.status === 'partial') {
    return <Badge tone="neutral">{pluralise(Math.round(goal.progress * 100), '%')} there</Badge>;
  }
  return <Badge tone="neutral">Not completed</Badge>;
};
