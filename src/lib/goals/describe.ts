/**
 * Goal summaries in plain language.
 *
 * Kept out of the components so the wording lives in one place and can be
 * changed without touching a screen. "Do this by 21:30" tells the reader what
 * the goal actually means; a raw column of numbers does not.
 */

import { formatClock, toCivilDate, formatDateLong } from '@/lib/date/civil';
import { formatAmount } from '@/lib/format';
import type { Goal } from '@/types/goal';

/** A one-line summary of what "done" means for this goal. */
export const describeTarget = (goal: Goal): string => {
  switch (goal.type) {
    case 'checkbox':
      return goal.targetValue === null ? 'Any time' : `${formatAmount(goal.targetValue)}×`;
    case 'time':
      return goal.targetTime === null ? 'Any time' : `by ${formatClock(goal.targetTime)}`;
    case 'duration':
      return goal.targetValue === null ? 'No duration' : `${formatAmount(goal.targetValue)} min`;
    default: {
      if (goal.targetValue === null) return 'No target';
      const value = formatAmount(goal.targetValue);
      return goal.unit === null ? value : `${value} ${goal.unit}`;
    }
  }
};

/** UTC timestamp → a civil date, without letting a bad value reach the formatter. */
export const describeArchivedOn = (iso: string): string => {
  const date = toCivilDate(iso.slice(0, 10));
  return date === null ? '' : `archived ${formatDateLong(date)}`;
};
