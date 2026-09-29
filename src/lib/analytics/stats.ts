/**
 * Aggregate statistics.
 *
 * Every rate here is `completed / scheduled` over days that actually had goals
 * scheduled. Counting a rest day as a missed day is how habit trackers talk
 * people out of using them, so empty days are excluded from every denominator.
 */

import type { ResolvedDay, DaySummary } from '@/lib/goals/resolve';
import type { ResolvedGoal, Goal } from '@/types/goal';
import { goalStreak, dayStreak, type Streak } from '@/lib/analytics/streaks';
import type { CivilDate } from '@/lib/date/civil';
import { addDays, startOfWeek } from '@/lib/date/civil';

export interface Totals {
  scheduled: number;
  completed: number;
  /** 0–1, or 0 when nothing was ever scheduled. */
  rate: number;
  days: number;
}

export const totalOf = (days: readonly ResolvedDay[]): Totals => {
  const relevant = days.filter((day) => day.summary.scheduled > 0);
  const scheduled = relevant.reduce((sum, day) => sum + day.summary.scheduled, 0);
  const completed = relevant.reduce((sum, day) => sum + day.summary.completed, 0);
  return {
    scheduled,
    completed,
    rate: scheduled > 0 ? completed / scheduled : 0,
    days: relevant.length,
  };
};

export interface CategoryBreakdownRow {
  categoryId: string | null;
  scheduled: number;
  completed: number;
  rate: number;
}

/** Grouped by category, strongest first. Null category collects unfiled goals. */
export const categoryBreakdown = (days: readonly ResolvedDay[]): CategoryBreakdownRow[] => {
  const buckets = new Map<string, CategoryBreakdownRow>();

  for (const day of days) {
    for (const goal of day.goals) {
      const key = goal.categoryId ?? 'uncategorised';
      const row = buckets.get(key) ?? { categoryId: goal.categoryId, scheduled: 0, completed: 0, rate: 0 };
      row.scheduled += 1;
      if (goal.completed) row.completed += 1;
      buckets.set(key, row);
    }
  }

  return [...buckets.values()]
    .map((row) => ({ ...row, rate: row.scheduled > 0 ? row.completed / row.scheduled : 0 }))
    .sort((a, b) => b.rate - a.rate || b.scheduled - a.scheduled);
};

export interface TrendPoint {
  date: CivilDate;
  label: string;
  rate: number;
  scheduled: number;
  completed: number;
}

const rateOf = (completed: number, scheduled: number): number =>
  scheduled > 0 ? Math.min(1, completed / scheduled) : 0;

/** Daily resolution rate across the given days, oldest first. */
export const dailyTrend = (days: readonly ResolvedDay[]): TrendPoint[] =>
  [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      date: day.date,
      label: day.date.slice(8, 10),
      rate: rateOf(day.summary.completed, day.summary.scheduled),
      scheduled: day.summary.scheduled,
      completed: day.summary.completed,
    }));

/** Weekly buckets: `[weekStart, completion rate]` for each week in the range. */
export interface WeeklyPoint {
  weekStart: CivilDate;
  label: string;
  rate: number;
  scheduled: number;
  completed: number;
}

export const weeklyTrend = (
  days: readonly ResolvedDay[],
  weekStartsOn: 1 | 7,
  labelFor: (weekStart: CivilDate) => string,
): WeeklyPoint[] => {
  const buckets = new Map<CivilDate, { scheduled: number; completed: number }>();

  for (const day of days) {
    if (day.summary.scheduled === 0) continue;
    const weekStart = startOfWeek(day.date, weekStartsOn);
    const bucket = buckets.get(weekStart) ?? { scheduled: 0, completed: 0 };
    bucket.scheduled += day.summary.scheduled;
    bucket.completed += day.summary.completed;
    buckets.set(weekStart, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, bucket]) => ({
      weekStart,
      label: labelFor(weekStart),
      rate: rateOf(bucket.completed, bucket.scheduled),
      ...bucket,
    }));
};

export interface GoalStats {
  goalId: string;
  name: string;
  streak: Streak;
  completed: number;
  scheduled: number;
  rate: number;
}

const completedDatesFor = (
  goal: Goal,
  days: readonly ResolvedDay[],
): ReadonlySet<CivilDate> => {
  const dates = new Set<CivilDate>();
  for (const day of days) {
    if (day.goals.some((resolved) => resolved.goalId === goal.id && resolved.completed)) {
      dates.add(day.date);
    }
  }
  return dates;
};

/**
 * Per-goal statistics. `from` is the later of "today" and the end of the range,
 * so a live streak is not truncated by the window being inspected.
 */
export const perGoalStats = (
  goals: readonly Goal[],
  days: readonly ResolvedDay[],
  from: CivilDate,
): GoalStats[] => {
  const totals = new Map<string, { completed: number; scheduled: number }>();
  for (const day of days) {
    for (const resolved of day.goals) {
      const row = totals.get(resolved.goalId) ?? { completed: 0, scheduled: 0 };
      row.scheduled += 1;
      if (resolved.completed) row.completed += 1;
      totals.set(resolved.goalId, row);
    }
  }

  return goals
    .map((goal) => {
      const row = totals.get(goal.id) ?? { completed: 0, scheduled: 0 };
      return {
        goalId: goal.id,
        name: goal.name,
        streak: goalStreak(goal, completedDatesFor(goal, days), from),
        completed: row.completed,
        scheduled: row.scheduled,
        rate: rateOf(row.completed, row.scheduled),
      };
    })
    .sort((a, b) => b.streak.current - a.streak.current || b.completed - a.completed);
};

/** Whole-day streak across every goal. */
export const overallStreak = (days: readonly ResolvedDay[], from: CivilDate): Streak =>
  dayStreak(
    days.map((day) => ({
      date: day.date,
      scheduled: day.summary.scheduled,
      completed: day.summary.completed,
    })),
    from,
  );

export interface Consistency {
  weekly: number;
  monthly: number;
}

const rangeRate = (days: readonly ResolvedDay[]): number => {
  const totals = totalOf(days);
  return totals.rate;
};

/**
 * Weekly and monthly consistency. The two windows are calendar-aligned rather
 * than "last 7 days", so the numbers line up with the calendar the user reads.
 */
export const consistency = (
  days: readonly ResolvedDay[],
  today: CivilDate,
  weekStartsOn: 1 | 7,
): Consistency => {
  const weekStart = startOfWeek(today, weekStartsOn);
  const monthStart = `${today.slice(0, 7)}-01`;

  const thisWeek = days.filter((day) => day.date >= weekStart && day.date <= today);
  const thisMonth = days.filter((day) => day.date >= monthStart && day.date <= today);

  return { weekly: rangeRate(thisWeek), monthly: rangeRate(thisMonth) };
};

/** The last `count` days ending at `from`, inclusive. */
export const trailingDays = (from: CivilDate, count: number): { from: CivilDate; to: CivilDate } => ({
  from: addDays(from, -(count - 1)),
  to: from,
});

export type { DaySummary, ResolvedGoal };
