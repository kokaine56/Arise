/**
 * Daily goal resolution.
 *
 * This is the primary source of truth for every screen. It is a pure function
 * of (goal definitions, daily records, date, timezone) with no I/O, so the
 * behaviour is fully testable and the dashboard, history and insights all
 * derive from exactly the same logic.
 *
 * Pipeline, per the product spec:
 *   1. Take the active recurring goals.
 *   2. Keep those whose schedule covers the requested date.
 *   3. Attach the completion record for that date.
 *   4. Normalise into `ResolvedGoal` and summarise.
 */

import { isEligibleOn, isLateCompletion, isPastDeadline, wasScheduledOn } from '@/lib/date/schedule';
import { normaliseProgress } from '@/lib/format';
import type { CivilDate } from '@/lib/date/civil';
import type { DailyRecord } from '@/types/dailyRecord';
import type { Goal, GoalDayStatus, ResolvedGoal } from '@/types/goal';

export interface ResolveOptions {
  date: CivilDate;
  timeZone: string;
  /** Passed in so results are deterministic under test. */
  now?: Date;
}

export interface DaySummary {
  date: CivilDate;
  /** Goals scheduled today. The denominator for every rate in the product. */
  scheduled: number;
  completed: number;
  /** Goals with some recorded progress but not yet at target. */
  partial: number;
  /** 0–1. Zero on a day with nothing scheduled, so it never skews averages. */
  rate: number;
  /** Every goal is done. Used for streak and copy decisions. */
  isComplete: boolean;
}

export interface ResolvedDay {
  date: CivilDate;
  goals: ResolvedGoal[];
  summary: DaySummary;
}

/** Index records by goal id so resolution is O(goals + records). */
export const indexRecordsByGoal = (
  records: readonly DailyRecord[],
): ReadonlyMap<string, DailyRecord> =>
  new Map(records.map((record) => [record.goalId, record]));

/** Merge one goal with its record for one date. */
export const resolveGoalDay = (
  goal: Goal,
  record: DailyRecord | null,
  options: ResolveOptions,
): ResolvedGoal => {
  const { timeZone } = options;
  const completed = record?.completed ?? false;

  const isMeasured =
    (goal.type === 'numeric' || goal.type === 'duration' || goal.type === 'count') &&
    goal.targetValue !== null &&
    goal.targetValue > 0;

  // For measured goals the *number* is the truth; for the others, completion
  // itself is, and the value is only there so progress maths has something to
  // divide.
  const actual = isMeasured
    ? Math.max(0, record?.actualValue ?? 0)
    : completed
      ? 1
      : 0;

  const progress = isMeasured ? normaliseProgress(actual, goal.targetValue ?? 1) : completed ? 1 : 0;

  const status: GoalDayStatus = completed ? 'completed' : progress > 0 ? 'partial' : 'open';

  const isLate =
    goal.type === 'time' && isLateCompletion(goal.targetTime, record?.completedAt ?? null, timeZone);

  return {
    goalId: goal.id,
    name: goal.name,
    type: goal.type,
    categoryId: goal.categoryId,
    target: goal.targetValue,
    unit: goal.unit,
    targetTime: goal.targetTime,
    actual,
    completed,
    progress,
    status,
    isLate,
    updatedAt: record?.updatedAt ?? null,
    goal,
  };
};

/** Has a `time` goal's deadline passed without it being completed? */
export const isOverdue = (resolved: ResolvedGoal, options: ResolveOptions): boolean =>
  resolved.goal.type === 'time' &&
  !resolved.completed &&
  isPastDeadline(resolved.goal.targetTime, options.timeZone, options.now ?? new Date());

/**
 * Resolve a full day.
 *
 * `goals` should be the user's live goals (active, not archived). Past dates
 * additionally surface goals that have since been paused, so a historical day
 * still reads correctly — use `wasScheduledOn` for that, via
 * `resolveHistoricalDay`.
 */
export const resolveDay = (
  goals: readonly Goal[],
  records: readonly DailyRecord[],
  options: ResolveOptions,
): ResolvedDay => {
  const byGoal = indexRecordsByGoal(records);

  const resolved = goals
    .filter((goal) => isEligibleOn(goal, options.date))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .map((goal) => resolveGoalDay(goal, byGoal.get(goal.id) ?? null, options));

  return { date: options.date, goals: resolved, summary: summarise(resolved, options.date) };
};

/**
 * Resolve a past day, including goals that are now paused or archived. Records
 * outlive the goal's active life — that is the whole point of keeping them.
 */
export const resolveHistoricalDay = (
  goals: readonly Goal[],
  records: readonly DailyRecord[],
  options: ResolveOptions,
): ResolvedDay => {
  const byGoal = indexRecordsByGoal(records);
  // A record is itself proof the goal existed on that day, so it is shown even
  // if the schedule has since changed.
  const withRecords = new Set(records.map((record) => record.goalId));

  const resolved = goals
    .filter(
      (goal) => withRecords.has(goal.id) || wasScheduledOn(goal, options.date),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .map((goal) => resolveGoalDay(goal, byGoal.get(goal.id) ?? null, options));

  return { date: options.date, goals: resolved, summary: summarise(resolved, options.date) };
};

export const summarise = (goals: readonly ResolvedGoal[], date: CivilDate): DaySummary => {
  const scheduled = goals.length;
  const completed = goals.reduce((total, goal) => total + (goal.completed ? 1 : 0), 0);
  const partial = goals.reduce(
    (total, goal) => total + (goal.status === 'partial' ? 1 : 0),
    0,
  );

  return {
    date,
    scheduled,
    completed,
    partial,
    rate: scheduled > 0 ? completed / scheduled : 0,
    isComplete: scheduled > 0 && completed === scheduled,
  };
};
