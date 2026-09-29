/**
 * Streaks.
 *
 * A streak counts *scheduled* days, never calendar days. A goal that runs
 * Monday, Wednesday and Friday is not expected on a Tuesday, so a Tuesday gap
 * neither extends nor breaks it. Days on which the goal was not scheduled are
 * skipped entirely.
 *
 * Today is also special: a day still in progress cannot break a live streak.
 * Leaving that to the day boundary is what makes an evening check-in feel right.
 */

import { addDays, type CivilDate } from '@/lib/date/civil';
import { isScheduledOn, type SchedulableGoal } from '@/lib/date/schedule';

export interface Streak {
  current: number;
  best: number;
  /** Most recent scheduled day that was completed, if any. */
  lastCompleted: CivilDate | null;
}

const EMPTY: Streak = { current: 0, best: 0, lastCompleted: null };

/** How far back to look. Beyond a year the history has stopped being useful. */
const WINDOW_DAYS = 400;

const scheduledDaysDescending = (
  goal: SchedulableGoal,
  from: CivilDate,
  windowDays = WINDOW_DAYS,
): CivilDate[] => {
  const days: CivilDate[] = [];
  for (let offset = 0; offset <= windowDays; offset += 1) {
    const date = addDays(from, -offset);
    if (isScheduledOn(goal, date)) days.push(date);
  }
  return days;
};

/**
 * Streak for a single goal, from the set of dates it was completed on.
 */
export const goalStreak = (
  goal: SchedulableGoal,
  completedDates: ReadonlySet<CivilDate>,
  from: CivilDate,
  windowDays = WINDOW_DAYS,
): Streak => {
  const days = scheduledDaysDescending(goal, from, windowDays);
  if (days.length === 0) return EMPTY;

  let best = 0;
  let run = 0;
  let lastCompleted: CivilDate | null = null;

  // Ascending pass for the historical maximum.
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i];
    if (day === undefined) continue;
    if (completedDates.has(day)) {
      run += 1;
      lastCompleted = day;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }

  // Descending pass for the live streak.
  let current = 0;
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    if (day === undefined) continue;
    if (day === from && !completedDates.has(day)) continue; // still in progress
    if (completedDates.has(day)) current += 1;
    else break;
  }

  return { current, best, lastCompleted };
};

/* -------------------------------------------------------------------------- */
/* Whole-day streaks                                                          */
/* -------------------------------------------------------------------------- */

export interface ScheduledDayOutcome {
  date: CivilDate;
  /** Goals scheduled that day. Zero means the day does not count at all. */
  scheduled: number;
  completed: number;
}

/**
 * The app-level streak: consecutive days on which everything scheduled was
 * completed. Days with nothing scheduled are ignored, so a rest day or a gap
 * between two projects never breaks the count.
 */
export const dayStreak = (outcomes: readonly ScheduledDayOutcome[], from: CivilDate): Streak => {
  const days = outcomes
    .filter((outcome) => outcome.scheduled > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (days.length === 0) return EMPTY;

  const isComplete = (outcome: ScheduledDayOutcome): boolean =>
    outcome.completed >= outcome.scheduled;

  let best = 0;
  let run = 0;
  let lastCompleted: CivilDate | null = null;

  for (const day of days) {
    if (isComplete(day)) {
      run += 1;
      lastCompleted = day.date;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }

  let current = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i];
    if (day === undefined) continue;
    if (day.date === from && !isComplete(day)) continue; // today is still open
    if (isComplete(day)) current += 1;
    else break;
  }

  return { current, best, lastCompleted };
};
