import { describe, expect, it } from 'vitest';
import { dayStreak, goalStreak, type ScheduledDayOutcome } from '@/lib/analytics/streaks';
import {
  categoryBreakdown,
  consistency,
  dailyTrend,
  overallStreak,
  perGoalStats,
  totalOf,
  trailingDays,
  weeklyTrend,
} from '@/lib/analytics/stats';
import { resolveDay } from '@/lib/goals/resolve';
import type { CivilDate } from '@/lib/date/civil';
import type { DailyRecord } from '@/types/dailyRecord';
import type { Goal } from '@/types/goal';

const TUE = '2026-09-29' as CivilDate;
const TZ = 'UTC';
const options = { date: TUE, timeZone: TZ, now: new Date('2026-09-29T12:00:00Z') };

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  name: 'Goal',
  description: null,
  type: 'checkbox',
  categoryId: null,
  targetValue: null,
  unit: null,
  targetTime: null,
  frequencyType: 'daily',
  frequencyConfig: { kind: 'daily' },
  startDate: '2020-01-01' as CivilDate, // far enough back that the scan window is never the limit
  endDate: null,
  reminderTime: null,
  isActive: true,
  sortOrder: 0,
  createdAt: '2020-01-01T00:00:00Z',
  updatedAt: '2020-01-01T00:00:00Z',
  archivedAt: null,
  ...overrides,
});

const rec = (goalId: string, date: CivilDate, completed = true): DailyRecord => ({
  id: `${goalId}-${date}`,
  goalId,
  date,
  completed,
  actualValue: null,
  notes: null,
  completedAt: '2026-09-29T12:00:00Z',
  createdAt: '2026-09-29T12:00:00Z',
  updatedAt: '2026-09-29T12:00:00Z',
});

const d = (date: string) => date as CivilDate;

/* -------------------------------------------------------------------------- */
/* goalStreak                                                                  */
/* -------------------------------------------------------------------------- */

describe('goal streaks', () => {
  it('counts consecutive scheduled days', () => {
    const set = new Set<CivilDate>([d('2026-09-29'), d('2026-09-28'), d('2026-09-27')]);
    expect(goalStreak(goal(), set, TUE).current).toBe(3);
  });

  it('breaks on a scheduled day that was missed', () => {
    const set = new Set<CivilDate>([d('2026-09-29'), d('2026-09-27')]);
    // 28th is a scheduled day with no record, so the run stops at 1.
    expect(goalStreak(goal(), set, TUE).current).toBe(1);
  });

  it('does not let an unfinished today break a live streak', () => {
    const set = new Set<CivilDate>([d('2026-09-28'), d('2026-09-27')]);
    // Today has no record yet, but the day is not over.
    expect(goalStreak(goal(), set, TUE).current).toBe(2);
  });

  it('ignores days the goal was never scheduled for', () => {
    // Monday, Wednesday, Friday only. A streak across Tue -> Wed must survive
    // the unscheduled Tuesday in between.
    const g = goal({
      frequencyType: 'selected_days',
      frequencyConfig: { kind: 'selected_days', days: [1, 3, 5] },
    });
    const set = new Set<CivilDate>([d('2026-09-30'), d('2026-09-28')]);
    // 30th is Wed, 28th is Mon; the 29th (Tue) is not scheduled.
    const streak = goalStreak(g, set, d('2026-09-30'));
    expect(streak.current).toBe(2);
  });

  it('remembers the best run even after it was broken', () => {
    const set = new Set<CivilDate>([d('2026-09-29')]);
    const streak = goalStreak(goal(), set, TUE, 400);
    // Only one completion in the window, so best is 1.
    expect(streak.best).toBe(1);
    expect(streak.current).toBe(1);
  });

  it('finds a best run longer than the current one', () => {
    // A long historical run, then a break, then today.
    const set = new Set<CivilDate>([
      d('2026-09-29'),
      d('2026-08-01'),
      d('2026-07-31'),
      d('2026-07-30'),
    ]);
    const streak = goalStreak(goal(), set, TUE);
    expect(streak.current).toBe(1);
    expect(streak.best).toBe(3);
  });

  it('reports no streak for a goal with no completions', () => {
    const streak = goalStreak(goal(), new Set(), TUE);
    expect(streak.current).toBe(0);
    expect(streak.best).toBe(0);
    expect(streak.lastCompleted).toBeNull();
  });

  it('reports nothing for a goal that has not started', () => {
    const future = goal({ startDate: '2027-01-01' as CivilDate });
    expect(goalStreak(future, new Set(), TUE).current).toBe(0);
  });

  it('records the most recent completed day', () => {
    const set = new Set<CivilDate>([d('2026-09-29'), d('2026-09-28')]);
    expect(goalStreak(goal(), set, TUE).lastCompleted).toBe(TUE);
  });
});

/* -------------------------------------------------------------------------- */
/* dayStreak                                                                   */
/* -------------------------------------------------------------------------- */

describe('whole-day streaks', () => {
  const day = (date: string, completed: number, scheduled = 2): ScheduledDayOutcome => ({
    date: date as CivilDate,
    completed,
    scheduled,
  });

  it('counts days on which everything scheduled was done', () => {
    const outcomes = [day('2026-09-27', 2), day('2026-09-28', 2), day('2026-09-29', 2)];
    expect(dayStreak(outcomes, TUE).current).toBe(3);
  });

  it('breaks on an incomplete day', () => {
    const outcomes = [day('2026-09-27', 2), day('2026-09-28', 1), day('2026-09-29', 2)];
    expect(dayStreak(outcomes, TUE).current).toBe(1);
  });

  it('ignores days with nothing scheduled', () => {
    // The 27th is a rest day; it must not break the streak.
    const outcomes = [day('2026-09-27', 0, 0), day('2026-09-28', 2), day('2026-09-29', 2)];
    expect(dayStreak(outcomes, TUE).current).toBe(2);
  });

  it('does not let an unfinished today break it', () => {
    const outcomes = [day('2026-09-27', 2), day('2026-09-28', 2), day('2026-09-29', 0)];
    expect(dayStreak(outcomes, TUE).current).toBe(2);
  });

  it('sorts unordered input before counting', () => {
    const outcomes = [day('2026-09-29', 2), day('2026-09-27', 2), day('2026-09-28', 2)];
    expect(dayStreak(outcomes, TUE).current).toBe(3);
  });

  it('reports nothing when every day was empty', () => {
    expect(dayStreak([day('2026-09-27', 0, 0)], TUE).current).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* stats                                                                       */
/* -------------------------------------------------------------------------- */

describe('totals', () => {
  const dayWith = (date: string, scheduled: number, completed: number) => ({
    date: date as CivilDate,
    goals: [],
    summary: {
      date: date as CivilDate,
      scheduled,
      completed,
      partial: 0,
      rate: scheduled > 0 ? completed / scheduled : 0,
      isComplete: scheduled > 0 && completed === scheduled,
    },
  });

  it('excludes empty days from the denominator', () => {
    const totals = totalOf([dayWith('2026-09-28', 2, 2), dayWith('2026-09-29', 0, 0)]);
    expect(totals.scheduled).toBe(2);
    expect(totals.days).toBe(1);
    expect(totals.rate).toBe(1);
  });

  it('reports a zero rate when nothing was ever scheduled', () => {
    const totals = totalOf([dayWith('2026-09-28', 0, 0)]);
    expect(totals.rate).toBe(0);
    expect(totals.days).toBe(0);
  });
});

describe('category breakdown', () => {
  const dayFor = (date: string, goals: { categoryId: string | null; completed: boolean }[]) => ({
    date: date as CivilDate,
    goals: goals.map((g, i) => ({
      goalId: `g${i}`,
      name: `G${i}`,
      type: 'checkbox' as const,
      categoryId: g.categoryId,
      target: null,
      unit: null,
      targetTime: null,
      actual: 0,
      completed: g.completed,
      progress: 0,
      status: 'open' as const,
      isLate: false,
      updatedAt: null,
      goal: goal(),
    })),
    summary: { date: date as CivilDate, scheduled: goals.length, completed: 0, partial: 0, rate: 0, isComplete: false },
  });

  it('groups by category and ranks by rate', () => {
    const days = [
      dayFor('2026-09-28', [
        { categoryId: 'fitness', completed: true },
        { categoryId: 'fitness', completed: false },
        { categoryId: 'sleep', completed: true },
      ]),
    ];
    const rows = categoryBreakdown(days);
    expect(rows[0]?.categoryId).toBe('sleep');
    expect(rows[0]?.rate).toBe(1);
    expect(rows[1]?.categoryId).toBe('fitness');
    expect(rows[1]?.rate).toBe(0.5);
  });

  it('collects uncategorised goals together', () => {
    const rows = categoryBreakdown([dayFor('2026-09-28', [{ categoryId: null, completed: true }])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.categoryId).toBeNull();
  });
});

describe('trends', () => {
  const dayWith = (date: string, completed: number, scheduled: number) => ({
    date: date as CivilDate,
    goals: [],
    summary: {
      date: date as CivilDate,
      scheduled,
      completed,
      partial: 0,
      rate: scheduled > 0 ? completed / scheduled : 0,
      isComplete: false,
    },
  });

  it('orders the daily trend oldest first', () => {
    const trend = dailyTrend([dayWith('2026-09-29', 1, 2), dayWith('2026-09-27', 1, 1)]);
    expect(trend.map((p) => p.date)).toEqual([d('2026-09-27'), d('2026-09-29')]);
  });

  it('reports a zero rate for an empty day rather than NaN', () => {
    const trend = dailyTrend([dayWith('2026-09-27', 0, 0)]);
    expect(trend[0]?.rate).toBe(0);
  });

  it('buckets weeks by the requested week start', () => {
    // 3 Oct is a Friday and 4 Oct a Sunday: one Monday-start week, but two
    // Sunday-start weeks.
    const days = [dayWith('2026-10-03', 1, 2), dayWith('2026-10-04', 1, 2)];

    const monday = weeklyTrend(days, 1, (w) => w);
    expect(monday).toHaveLength(1);
    expect(monday[0]?.weekStart).toBe(d('2026-09-28'));

    const sunday = weeklyTrend(days, 7, (w) => w);
    expect(sunday).toHaveLength(2);
    expect(sunday.map((p) => p.weekStart)).toEqual([d('2026-09-27'), d('2026-10-04')]);
  });

  it('skips empty days when bucketing weeks', () => {
    expect(weeklyTrend([dayWith('2026-09-29', 0, 0)], 1, (w) => w)).toHaveLength(0);
  });
});

describe('per-goal statistics', () => {
  const a = goal({ id: 'a', name: 'A' });
  const b = goal({ id: 'b', name: 'B' });

  it('ranks by live streak, then by completions', () => {
    const days = [resolveDay([a, b], [rec('a', TUE)], options)];
    const stats = perGoalStats([a, b], days, TUE);
    expect(stats.map((s) => s.goalId)).toEqual(['a', 'b']);
    expect(stats[0]?.streak.current).toBe(1);
  });

  it('reports a zero rate for a goal with no records in range', () => {
    const stats = perGoalStats([a], [resolveDay([a], [], options)], TUE);
    expect(stats[0]?.rate).toBe(0);
    expect(stats[0]?.scheduled).toBe(1);
  });
});

describe('consistency and helpers', () => {
  const dayWith = (date: string, completed: number, scheduled: number) => ({
    date: date as CivilDate,
    goals: [],
    summary: { date: date as CivilDate, scheduled, completed, partial: 0, rate: 0, isComplete: false },
  });

  it('aligns windows to the calendar, not to a rolling 7 days', () => {
    const days = [
      dayWith('2026-08-31', 1, 1), // the week before last
      dayWith('2026-09-01', 1, 1), // last month
      dayWith('2026-09-29', 1, 2), // this week, today
    ];
    const result = consistency(days, TUE, 1);
    // Weekly window is Mon 28 Sep .. today, so only today's day counts.
    expect(result.weekly).toBeCloseTo(0.5);
    // Monthly window is 1 Sep .. today, so the 1st is included.
    expect(result.monthly).toBeCloseTo(2 / 3);
  });

  it('excludes days after today', () => {
    const days = [dayWith('2026-09-29', 2, 2), dayWith('2026-09-30', 0, 2)];
    expect(consistency(days, TUE, 1).weekly).toBe(1);
  });

  it('returns a zero rate for an empty window', () => {
    expect(consistency([], TUE, 1)).toEqual({ weekly: 0, monthly: 0 });
  });

  it('builds an inclusive trailing range', () => {
    expect(trailingDays(TUE, 7)).toEqual({ from: d('2026-09-23'), to: TUE });
    expect(trailingDays(TUE, 1)).toEqual({ from: TUE, to: TUE });
  });
});

describe('overall streak wiring', () => {
  it('feeds day summaries into the day streak', () => {
    const a = goal({ id: 'a' });
    const days = [resolveDay([a], [rec('a', TUE)], options)];
    expect(overallStreak(days, TUE).current).toBe(1);
  });
});
