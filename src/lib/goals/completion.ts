/**
 * Completion planning.
 *
 * Turning a user intent into the exact record that should be stored is pure
 * arithmetic, so it lives here rather than inside a component or a hook. The
 * UI applies the returned plan optimistically, the service persists it, and a
 * failure rolls back to the snapshot the caller kept — the three stages can
 * never disagree because all three read from this one function.
 *
 * The rules mirror the database's BEFORE trigger exactly. The database is the
 * final arbiter; this is what the interface shows in the meantime.
 */

import { clockToMinutes, minutesOfLocalDay } from '@/lib/date/schedule';
import type { CivilDate } from '@/lib/date/civil';
import type { DailyRecord, DailyRecordInput } from '@/types/dailyRecord';
import type { Goal } from '@/types/goal';

export type CompletionIntent =
  | { kind: 'toggle'; completed: boolean }
  | { kind: 'set_actual'; actualValue: number }
  | { kind: 'adjust_actual'; delta: number }
  | { kind: 'clear' };

export const isMeasuredGoal = (goal: Goal): boolean =>
  (goal.type === 'numeric' || goal.type === 'duration' || goal.type === 'count') &&
  goal.targetValue !== null;

/**
 * The target magnitude, or null for goals whose completion is a plain boolean.
 */
export const targetOf = (goal: Goal): number | null =>
  isMeasuredGoal(goal) ? (goal.targetValue ?? null) : null;

/** Whether a goal is a *due-by* deadline rather than a quantity. */
export const isDeadlineGoal = (goal: Goal): boolean => goal.type === 'time';

const round = (value: number): number => Math.round(value * 1000) / 1000;

const clampActual = (goal: Goal, value: number): number => {
  const safe = Number.isFinite(value) ? value : 0;
  const nonNegative = Math.max(0, safe);
  const target = targetOf(goal);
  // Allow a small overshoot: 12,500 steps genuinely happened.
  return target === null ? round(nonNegative) : round(Math.min(nonNegative, target * 4));
};

/**
 * Build the record that an intent implies.
 *
 * `now` is injected so behaviour is deterministic in tests and so a single
 * instant is used for both the optimistic write and the persisted row.
 */
export const planRecord = (
  goal: Goal,
  current: DailyRecord | null,
  date: CivilDate,
  intent: CompletionIntent,
  context: { timeZone: string; now: Date },
): DailyRecordInput => {
  const base: DailyRecordInput = {
    goalId: goal.id,
    date,
    completed: false,
    actualValue: null,
    notes: current?.notes ?? null,
    completedAt: null,
  };

  switch (intent.kind) {
    case 'clear':
      return base;

    case 'toggle': {
      if (isMeasuredGoal(goal)) {
        // Checking a measured goal fills it to target; unchecking resets it.
        const actualValue = intent.completed ? (targetOf(goal) ?? 0) : 0;
        return {
          ...base,
          actualValue,
          completed: intent.completed,
          completedAt: intent.completed ? context.now.toISOString() : null,
        };
      }
      return {
        ...base,
        completed: intent.completed,
        completedAt: intent.completed ? context.now.toISOString() : null,
      };
    }

    case 'set_actual': {
      if (!isMeasuredGoal(goal)) return base;
      const actualValue = clampActual(goal, intent.actualValue);
      const target = targetOf(goal) ?? 0;
      const completed = target > 0 && actualValue >= target;
      return {
        ...base,
        actualValue,
        completed,
        completedAt: completed ? (current?.completedAt ?? context.now.toISOString()) : null,
      };
    }

    case 'adjust_actual': {
      if (!isMeasuredGoal(goal)) return base;
      const actualValue = clampActual(goal, (current?.actualValue ?? 0) + intent.delta);
      const target = targetOf(goal) ?? 0;
      const completed = target > 0 && actualValue >= target;
      return {
        ...base,
        actualValue,
        completed,
        // Crossing the target for the first time stamps the moment; a later
        // increase must not move the recorded completion time.
        completedAt: completed ? (current?.completedAt ?? context.now.toISOString()) : null,
      };
    }

    default: {
      const exhaustive: never = intent;
      void exhaustive;
      return base;
    }
  }
};

/**
 * Would completing this deadline goal now count as late? Drives the honest
 * "after 11:00 PM" note on time goals.
 */
export const wouldBeLate = (goal: Goal, now: Date, timeZone: string): boolean => {
  if (!isDeadlineGoal(goal) || !goal.targetTime) return false;
  return minutesOfLocalDay(now, timeZone) > clockToMinutes(goal.targetTime);
};

/**
 * A sensible first step for a stepper, so + and − are not arbitrary.
 */
export const suggestStep = (goal: Goal): number => {
  const target = targetOf(goal);
  if (target === null) return 1;
  if (goal.type === 'duration') return target <= 30 ? 5 : 10;
  if (goal.type === 'count') return target <= 20 ? 5 : 10;
  if (goal.type === 'numeric') {
    // A tenth of the target reads naturally: 3 km → 0.3, 30 pages → 3.
    const tenth = round(target / 10);
    return tenth >= 1 ? tenth : round(target / 4) || 1;
  }
  return 1;
};

/**
 * Turn a plan into the record the interface should show right now.
 *
 * Both the optimistic UI and the persisted result go through this, so what the
 * user sees instantly is exactly what the database will hold — there is no
 * second, divergent "optimistic" shape to keep in sync.
 */
export const materialiseRecord = (
  goal: Goal,
  plan: DailyRecordInput,
  current: DailyRecord | null,
  now: Date,
): DailyRecord => ({
  id: current?.id ?? 'optimistic',
  goalId: goal.id,
  date: plan.date,
  completed: plan.completed,
  actualValue: plan.actualValue,
  notes: plan.notes ?? null,
  completedAt: plan.completedAt ?? null,
  createdAt: current?.createdAt ?? now.toISOString(),
  updatedAt: now.toISOString(),
});
