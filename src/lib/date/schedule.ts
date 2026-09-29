/**
 * Goal scheduling.
 *
 * The single source of truth for "is this goal part of this day?". Recurring
 * goals are never materialised into future rows — the schedule is evaluated
 * lazily from the definition, and only real user actions create records.
 */

import {
  addDays,
  compareCivil,
  diffDays,
  eachDay,
  isoDayOf,
  localTimeIn,
  type CivilDate,
} from '@/lib/date/civil';
import {
  DAY_LABELS,
  DAY_LABELS_LONG,
  type FrequencyConfig,
  type FrequencyType,
  type Goal,
  type IsoDay,
} from '@/types/goal';

/** The fields scheduling needs. Keeps this usable for tests and previews. */
export type SchedulableGoal = Pick<
  Goal,
  'startDate' | 'endDate' | 'frequencyType' | 'frequencyConfig'
>;

const MAX_SCAN_DAYS = 400;

/* -------------------------------------------------------------------------- */
/* Core predicate                                                             */
/* -------------------------------------------------------------------------- */

const matchesFrequency = (config: FrequencyConfig, date: CivilDate, startDate: CivilDate): boolean => {
  switch (config.kind) {
    case 'daily':
      return true;
    case 'weekdays': {
      const iso = isoDayOf(date);
      return iso >= 1 && iso <= 5;
    }
    case 'weekends':
      return isoDayOf(date) === 6 || isoDayOf(date) === 7;
    case 'selected_days':
      return config.days.includes(isoDayOf(date));
    case 'weekly': {
      const everyWeeks = Math.max(1, Math.trunc(config.everyWeeks));
      return diffDays(startDate, date) % (7 * everyWeeks) === 0;
    }
    case 'custom_interval': {
      const everyNDays = Math.max(1, Math.trunc(config.everyNDays));
      return diffDays(startDate, date) % everyNDays === 0;
    }
    default: {
      // Exhaustiveness guard: a new frequency kind must be handled here.
      const exhaustive: never = config;
      void exhaustive;
      return false;
    }
  }
};

/**
 * Does the goal's definition place it on this date?
 *
 * Order matters: the date window is checked first so that an expired goal is
 * rejected even if its frequency would otherwise match.
 */
export const isScheduledOn = (goal: SchedulableGoal, date: CivilDate): boolean => {
  if (compareCivil(date, goal.startDate) < 0) return false;
  if (goal.endDate !== null && compareCivil(date, goal.endDate) > 0) return false;
  return matchesFrequency(goal.frequencyConfig, date, goal.startDate);
};

/**
 * The full day-eligibility test, including lifecycle state. This is what the
 * daily resolution pipeline uses.
 */
export const isEligibleOn = (
  goal: Pick<Goal, 'isActive' | 'archivedAt'> & SchedulableGoal,
  date: CivilDate,
): boolean => {
  if (!goal.isActive) return false;
  if (goal.archivedAt !== null) return false;
  return isScheduledOn(goal, date);
};

/**
 * Would this goal have been scheduled on this date, ignoring whether it is
 * currently paused or archived? History must keep showing goals that were
 * later paused, otherwise past records look like they never happened.
 */
export const wasScheduledOn = (
  goal: Pick<Goal, 'startDate' | 'endDate' | 'frequencyType' | 'frequencyConfig'>,
  date: CivilDate,
): boolean => isScheduledOn(goal, date);

/* -------------------------------------------------------------------------- */
/* Iteration                                                                  */
/* -------------------------------------------------------------------------- */

/** Days in `[from, to]` on which the goal is scheduled, oldest first. */
export const scheduledDaysBetween = (
  goal: SchedulableGoal,
  from: CivilDate,
  to: CivilDate,
): CivilDate[] => eachDay(from, to).filter((date) => isScheduledOn(goal, date));

/** The first scheduled day on or after `from`, or null within the scan window. */
export const nextScheduledDay = (
  goal: SchedulableGoal,
  from: CivilDate,
): CivilDate | null => {
  const limit = addDays(from, MAX_SCAN_DAYS);
  for (const date of eachDay(from, limit)) {
    if (isScheduledOn(goal, date)) return date;
  }
  return null;
};

/** The first scheduled day strictly before `from`, or null. */
export const previousScheduledDay = (
  goal: SchedulableGoal,
  from: CivilDate,
): CivilDate | null => {
  // Walk backwards from `from` so the *nearest* preceding day wins. Iterating
  // the whole window forwards would return the oldest match instead.
  const limit = addDays(from, -MAX_SCAN_DAYS);
  for (let date = addDays(from, -1); compareCivil(date, limit) >= 0; date = addDays(date, -1)) {
    if (isScheduledOn(goal, date)) return date;
  }
  return null;
};

export const upcomingDays = (
  goal: SchedulableGoal,
  from: CivilDate,
  count: number,
): CivilDate[] => {
  const out: CivilDate[] = [];
  let cursor = from;
  while (out.length < count) {
    const next = nextScheduledDay(goal, cursor);
    if (next === null) break;
    out.push(next);
    cursor = addDays(next, 1);
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* Human-readable summaries                                                   */
/* -------------------------------------------------------------------------- */

const listWeekdays = (days: readonly IsoDay[]): string => {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0) return 'No days selected';
  if (sorted.length === 7) return 'Every day';
  if (sorted.length === 5 && sorted.every((d) => d <= 5)) return 'Every weekday';
  if (sorted.length === 2 && sorted.every((d) => d >= 6)) return 'Every weekend';
  return sorted.map((d) => DAY_LABELS[d]).join(', ');
};

const WEEKLY: Record<FrequencyType, (config: FrequencyConfig) => string> = {
  daily: () => 'Every day',
  weekdays: () => 'Every weekday',
  weekends: () => 'Every weekend',
  selected_days: (config) =>
    config.kind === 'selected_days' ? listWeekdays(config.days) : 'Specific days',
  weekly: (config) => {
    const everyWeeks = config.kind === 'weekly' ? config.everyWeeks : 1;
    return everyWeeks <= 1 ? 'Every week' : `Every ${everyWeeks} weeks`;
  },
  custom_interval: (config) => {
    const everyNDays = config.kind === 'custom_interval' ? config.everyNDays : 1;
    return everyNDays <= 1 ? 'Every day' : `Every ${everyNDays} days`;
  },
};

/** "Monday, Wednesday, Friday" — for screen readers and goal cards. */
export const scheduleLabelLong = (goal: SchedulableGoal): string => {
  const base = WEEKLY[goal.frequencyType](goal.frequencyConfig);
  if (goal.frequencyType === 'selected_days' && goal.frequencyConfig.kind === 'selected_days') {
    const days = [...new Set(goal.frequencyConfig.days)].sort((a, b) => a - b);
    return days.map((d) => DAY_LABELS_LONG[d]).join(', ');
  }
  return base;
};

/** "Every day" / "Mon, Wed, Fri" — for dense UI. */
export const scheduleLabel = (goal: SchedulableGoal): string => {
  if (goal.frequencyType === 'selected_days' && goal.frequencyConfig.kind === 'selected_days') {
    return listWeekdays(goal.frequencyConfig.days);
  }
  return WEEKLY[goal.frequencyType](goal.frequencyConfig);
};

/** "Every day until 30 Sep" / "From 1 Oct" — the schedule's bounds. */
export const scheduleBounds = (goal: SchedulableGoal): string | null => {
  if (goal.endDate !== null) return `until ${goal.endDate}`;
  return null;
};

/* -------------------------------------------------------------------------- */
/* Time-of-day comparison, for `time` goals                                   */
/* -------------------------------------------------------------------------- */

const CLOCK_PATTERN = /^(\d{2}):(\d{2})$/;

export const isValidClock = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const match = CLOCK_PATTERN.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
};

/** Minutes since midnight. Invalid input sorts late rather than throwing. */
export const clockToMinutes = (clock: string | null | undefined): number => {
  const match = CLOCK_PATTERN.exec(clock ?? '');
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]) * 60 + Number(match[2]);
};

export const minutesToClock = (minutes: number): string => {
  const total = ((Math.trunc(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * A time goal completed after its target time is *late*, not failed. It still
 * counts toward the day — a past bedtime is still a past bedtime.
 *
 * `completedAt` is a UTC instant, so it must be projected into the user's
 * timezone before the wall-clock comparison. Comparing a UTC instant against a
 * local `HH:MM` would mis-flag every goal for anyone not on UTC.
 */
export const isLateCompletion = (
  targetTime: string | null,
  completedAt: string | null,
  timeZone: string,
): boolean => {
  if (!targetTime || !completedAt) return false;
  const instant = new Date(completedAt);
  if (Number.isNaN(instant.getTime())) return false;
  const target = clockToMinutes(targetTime);
  if (!Number.isFinite(target)) return false;
  return minutesOfLocalDay(instant, timeZone) > target;
};

/** Wall-clock minutes since midnight in the given zone. */
export const minutesOfLocalDay = (instant: Date, timeZone: string): number => {
  const { hours, minutes } = localTimeIn(timeZone, instant);
  return hours * 60 + minutes;
};

/**
 * Has today's target time already passed? Used to show a pending time goal as
 * "past due" without judging the user for it.
 */
export const isPastDeadline = (
  targetTime: string | null,
  timeZone: string,
  now: Date = new Date(),
): boolean => {
  if (!targetTime) return false;
  const target = clockToMinutes(targetTime);
  if (!Number.isFinite(target)) return false;
  return minutesOfLocalDay(now, timeZone) > target;
};

