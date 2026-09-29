/**
 * Insights composition.
 *
 * One read of goals plus one indexed read of records covers the whole page.
 * Everything else is derived by the pure functions in `lib/analytics`, so the
 * same maths is unit-testable without a database.
 */

import { getDaysInRange } from '@/services/daily/daily.service';
import { listGoals } from '@/services/goals/goals.service';
import {
  categoryBreakdown,
  consistency,
  dailyTrend,
  overallStreak,
  perGoalStats,
  totalOf,
  weeklyTrend,
  type CategoryBreakdownRow,
  type Consistency,
  type GoalStats,
  type Totals,
  type TrendPoint,
  type WeeklyPoint,
} from '@/lib/analytics/stats';
import type { Streak } from '@/lib/analytics/streaks';
import { addDays, formatDateShort, startOfMonth, type CivilDate } from '@/lib/date/civil';
import type { ResolvedDay } from '@/lib/goals/resolve';
import type { WeekStart } from '@/types/profile';

/** How much history Insights needs. 90 days covers "monthly consistency". */
export const INSIGHTS_WINDOW_DAYS = 90;

export interface Insights {
  today: CivilDate;
  from: CivilDate;
  days: ResolvedDay[];
  allTime: Totals;
  last30: Totals;
  last7: Totals;
  currentStreak: Streak;
  bestStreak: Streak;
  perGoal: GoalStats[];
  byCategory: CategoryBreakdownRow[];
  daily: TrendPoint[];
  weekly: WeeklyPoint[];
  consistency: Consistency;
}

export interface InsightsQuery {
  today: CivilDate;
  timeZone: string;
  weekStartsOn: WeekStart;
  now?: Date;
  windowDays?: number;
}

export const getInsights = async ({
  today,
  timeZone,
  weekStartsOn,
  now = new Date(),
  windowDays = INSIGHTS_WINDOW_DAYS,
}: InsightsQuery): Promise<Insights> => {
  // Go back a little further than the reporting window: a goal's streak can
  // reach behind the first day shown.
  const from = addDays(today, -(windowDays + 7));

  const [days, allGoals] = await Promise.all([
    getDaysInRange({ from, to: today, timeZone, now }),
    listGoals({ includeArchived: true }),
  ]);

  const window = days.filter((day) => day.date >= addDays(today, -(windowDays - 1)));
  const liveGoals = allGoals.filter((goal) => goal.archivedAt === null);

  return {
    today,
    from: window[0]?.date ?? from,
    days: window,
    allTime: totalOf(days),
    last30: totalOf(window.slice(-30)),
    last7: totalOf(window.slice(-7)),
    currentStreak: overallStreak(days, today),
    bestStreak: overallStreak(days, today),
    perGoal: perGoalStats(liveGoals, days, today),
    byCategory: categoryBreakdown(window),
    daily: dailyTrend(window),
    weekly: weeklyTrend(window, weekStartsOn, (weekStart) => formatDateShort(weekStart)),
    consistency: consistency(window, today, weekStartsOn),
  };
};

/** Inclusive bounds of the calendar month containing `date`. */
export const monthBounds = (date: CivilDate): { from: CivilDate; to: CivilDate } => {
  const from = startOfMonth(date);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${date.slice(0, 7)}-${String(lastDay).padStart(2, '0')}` as CivilDate;
  return { from, to };
};
