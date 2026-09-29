import { describe, expect, it } from 'vitest';
import {
  isOverdue,
  resolveDay,
  resolveGoalDay,
  resolveHistoricalDay,
  summarise,
} from '@/lib/goals/resolve';
import {
  isDeadlineGoal,
  isMeasuredGoal,
  materialiseRecord,
  planRecord,
  suggestStep,
  targetOf,
  wouldBeLate,
  type CompletionIntent,
} from '@/lib/goals/completion';
import type { CivilDate } from '@/lib/date/civil';
import type { DailyRecord, DailyRecordInput } from '@/types/dailyRecord';
import type { Goal, GoalType } from '@/types/goal';

const DATE = '2026-09-29' as CivilDate; // a Tuesday
const NOW = new Date('2026-09-29T12:00:00Z');
const TZ = 'UTC';

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  userId: 'u1',
  name: 'Goal',
  description: null,
  type: 'checkbox',
  categoryId: null,
  targetValue: null,
  unit: null,
  targetTime: null,
  frequencyType: 'daily',
  frequencyConfig: { kind: 'daily' },
  startDate: '2026-01-01' as CivilDate,
  endDate: null,
  reminderTime: null,
  isActive: true,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  archivedAt: null,
  ...overrides,
});

const measured = (type: GoalType, target: number, unit: string | null = null): Goal =>
  goal({ type, targetValue: target, unit });

const record = (overrides: Partial<DailyRecord> = {}): DailyRecord => ({
  id: 'r1',
  goalId: 'g1',
  userId: 'u1',
  date: DATE,
  completed: false,
  actualValue: null,
  notes: null,
  completedAt: null,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...overrides,
});

const options = { date: DATE, timeZone: TZ, now: NOW };

/* -------------------------------------------------------------------------- */
/* resolveGoalDay                                                              */
/* -------------------------------------------------------------------------- */

describe('resolving a single goal', () => {
  it('treats a checkbox with no record as untouched', () => {
    const resolved = resolveGoalDay(goal(), null, options);
    expect(resolved.completed).toBe(false);
    expect(resolved.status).toBe('open');
    expect(resolved.progress).toBe(0);
    expect(resolved.actual).toBe(0);
  });

  it('treats a completed checkbox as fully done', () => {
    const resolved = resolveGoalDay(goal(), record({ completed: true, completedAt: NOW.toISOString() }), options);
    expect(resolved.completed).toBe(true);
    expect(resolved.status).toBe('completed');
    expect(resolved.progress).toBe(1);
  });

  it('divides a measured goal by its target', () => {
    const g = measured('numeric', 100);
    const resolved = resolveGoalDay(g, record({ actualValue: 50 }), options);
    expect(resolved.progress).toBeCloseTo(0.5);
    expect(resolved.status).toBe('partial');
    expect(resolved.completed).toBe(false);
  });

  it('caps progress at 1 when the target is exceeded', () => {
    const g = measured('count', 10);
    const resolved = resolveGoalDay(g, record({ actualValue: 25 }), options);
    expect(resolved.progress).toBe(1);
  });

  it('does not divide by zero when a target is missing', () => {
    const g = goal({ type: 'numeric', targetValue: null });
    const resolved = resolveGoalDay(g, record({ actualValue: 40 }), options);
    expect(Number.isNaN(resolved.progress)).toBe(false);
  });

  it('clamps a negative recorded value to zero', () => {
    const g = measured('numeric', 100);
    const resolved = resolveGoalDay(g, record({ actualValue: -20 }), options);
    expect(resolved.actual).toBe(0);
    expect(resolved.progress).toBe(0);
  });

  it('carries the full definition through for edit affordances', () => {
    const g = goal({ name: 'Drink water' });
    expect(resolveGoalDay(g, null, options).goal).toBe(g);
  });
});

describe('lateness', () => {
  it('flags a time goal completed after its target time', () => {
    const g = goal({ type: 'time', targetTime: '09:00' });
    const resolved = resolveGoalDay(
      g,
      record({ completed: true, completedAt: '2026-09-29T11:00:00Z' }),
      options,
    );
    expect(resolved.isLate).toBe(true);
  });

  it('does not flag a time goal completed on time', () => {
    const g = goal({ type: 'time', targetTime: '23:00' });
    const resolved = resolveGoalDay(
      g,
      record({ completed: true, completedAt: '2026-09-29T11:00:00Z' }),
      options,
    );
    expect(resolved.isLate).toBe(false);
  });

  it('never marks a non-time goal late', () => {
    expect(resolveGoalDay(goal(), record({ completed: true }), options).isLate).toBe(false);
  });

  it('reports a time goal as overdue only while it is unfinished', () => {
    const g = goal({ type: 'time', targetTime: '09:00' });
    const past = { date: DATE, timeZone: TZ, now: new Date('2026-09-29T12:00:00Z') };

    expect(isOverdue(resolveGoalDay(g, null, options), past)).toBe(true);
    expect(isOverdue(resolveGoalDay(g, record({ completed: true }), options), past)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* resolveDay / resolveHistoricalDay                                            */
/* -------------------------------------------------------------------------- */

describe('resolving a whole day', () => {
  const a = goal({ id: 'a', name: 'A', sortOrder: 0 });
  const b = goal({ id: 'b', name: 'B', sortOrder: 1 });
  const paused = goal({ id: 'c', name: 'Paused', isActive: false });

  it('keeps only the goals scheduled that day', () => {
    const weekdayOnly = goal({
      id: 'wk',
      name: 'Weekdays',
      frequencyType: 'weekdays',
      frequencyConfig: { kind: 'weekdays' },
    });
    const day = resolveDay([a, b, weekdayOnly], [], options);
    expect(day.goals.map((g) => g.goalId).sort()).toEqual(['a', 'b', 'wk']);
  });

  it('excludes paused and archived goals from the live day', () => {
    const day = resolveDay([a, paused, goal({ id: 'z', archivedAt: NOW.toISOString() })], [], options);
    expect(day.goals.map((g) => g.goalId)).toEqual(['a']);
  });

  it('respects sort order', () => {
    const day = resolveDay([b, a], [], options);
    expect(day.goals.map((g) => g.goalId)).toEqual(['a', 'b']);
  });

  it('summarises the day', () => {
    const day = resolveDay(
      [a, b],
      [record({ id: 'r1', goalId: 'a', completed: true })],
      options,
    );
    expect(day.summary).toMatchObject({ scheduled: 2, completed: 1, rate: 0.5, isComplete: false });
  });
});

describe('resolving a historical day', () => {
  const pausedLater = goal({ id: 'p', name: 'Paused later', isActive: false });
  const archivedLater = goal({ id: 'r', name: 'Archived later', isActive: false, archivedAt: NOW.toISOString() });

  it('still shows a goal that was paused afterwards', () => {
    const day = resolveHistoricalDay([pausedLater], [], options);
    expect(day.goals.map((g) => g.goalId)).toEqual(['p']);
  });

  it('still shows a goal that was archived afterwards', () => {
    const day = resolveHistoricalDay([archivedLater], [], options);
    expect(day.goals.map((g) => g.goalId)).toEqual(['r']);
  });

  it('shows a goal whose schedule no longer covers the date, if a record exists', () => {
    const changed = goal({
      id: 'c',
      name: 'Rescheduled',
      startDate: '2026-10-01' as CivilDate, // starts after the historical date
    });
    const day = resolveHistoricalDay([changed], [record({ goalId: 'c' })], options);
    expect(day.goals.map((g) => g.goalId)).toEqual(['c']);
  });

  it('hides a goal that neither matches the date nor has a record', () => {
    const changed = goal({ id: 'c', startDate: '2026-10-01' as CivilDate });
    expect(resolveHistoricalDay([changed], [], options).goals).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* summarise                                                                    */
/* -------------------------------------------------------------------------- */

describe('day summaries', () => {
  it('reports zero rather than NaN on a day with nothing scheduled', () => {
    const summary = summarise([], DATE);
    expect(summary.rate).toBe(0);
    // An empty day must not read as "complete", or streaks would be free wins.
    expect(summary.isComplete).toBe(false);
  });

  it('counts partial progress separately from completion', () => {
    const day = resolveDay(
      [measured('numeric', 100, 'g')],
      [record({ actualValue: 50 })],
      options,
    );
    expect(day.summary.partial).toBe(1);
    expect(day.summary.completed).toBe(0);
  });

  it('marks a day complete only when nothing is outstanding', () => {
    const day = resolveDay(
      [measured('numeric', 100, 'g')],
      [record({ actualValue: 100, completed: true })],
      options,
    );
    expect(day.summary.isComplete).toBe(true);
    expect(day.summary.rate).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* planRecord                                                                   */
/* -------------------------------------------------------------------------- */

const plan = (g: Goal, intent: CompletionIntent, current: DailyRecord | null = null): DailyRecordInput =>
  planRecord(g, current, DATE, intent, { timeZone: TZ, now: NOW });

describe('planning a completion', () => {
  it('toggles a checkbox', () => {
    expect(plan(goal(), { kind: 'toggle', completed: true })).toMatchObject({
      goalId: 'g1',
      date: DATE,
      completed: true,
      actualValue: null,
      completedAt: NOW.toISOString(),
    });
  });

  it('stamps no completion time when unchecking', () => {
    expect(plan(goal(), { kind: 'toggle', completed: false }).completedAt).toBeNull();
  });

  it('fills a measured goal to its target when checked', () => {
    const g = measured('count', 10);
    const p = plan(g, { kind: 'toggle', completed: true });
    expect(p.actualValue).toBe(10);
    expect(p.completed).toBe(true);
  });

  it('resets a measured goal to zero when unchecked', () => {
    const g = measured('count', 10);
    const p = plan(g, { kind: 'toggle', completed: false }, record({ actualValue: 7, completed: true }));
    expect(p.actualValue).toBe(0);
    expect(p.completed).toBe(false);
  });

  it('completes a measured goal once the target is reached', () => {
    const g = measured('numeric', 1000, 'steps');
    expect(plan(g, { kind: 'set_actual', actualValue: 999 }).completed).toBe(false);
    expect(plan(g, { kind: 'set_actual', actualValue: 1000 }).completed).toBe(true);
  });

  it('allows a real overshoot without going unbounded', () => {
    const g = measured('count', 10);
    // 12,500 steps genuinely happened, so 4x is permitted.
    expect(plan(g, { kind: 'set_actual', actualValue: 12500 }).actualValue).toBe(40);
  });

  it('rejects negative and non-finite input', () => {
    const g = measured('numeric', 100);
    expect(plan(g, { kind: 'set_actual', actualValue: -5 }).actualValue).toBe(0);
    expect(plan(g, { kind: 'set_actual', actualValue: Number.NaN }).actualValue).toBe(0);
  });

  it('ignores a value change on an unmeasured goal', () => {
    const p = plan(goal(), { kind: 'set_actual', actualValue: 42 });
    expect(p.actualValue).toBeNull();
    expect(p.completed).toBe(false);
  });

  it('applies an adjustment relative to the current value', () => {
    const g = measured('numeric', 1000, 'steps');
    const p = plan(g, { kind: 'adjust_actual', delta: 250 }, record({ actualValue: 300 }));
    expect(p.actualValue).toBe(550);
  });

  it('clamps an adjustment at the same overshoot ceiling as a direct set', () => {
    const g = measured('numeric', 100, 'steps');
    const p = plan(g, { kind: 'adjust_actual', delta: 250 }, record({ actualValue: 300 }));
    expect(p.actualValue).toBe(400); // 4x the target
  });

  it('treats the first adjustment as starting from zero', () => {
    const g = measured('count', 100);
    expect(plan(g, { kind: 'adjust_actual', delta: 25 }).actualValue).toBe(25);
  });

  it('preserves the original completion time when the value goes up later', () => {
    const g = measured('numeric', 100);
    const original = '2026-09-29T08:00:00Z';
    const p = plan(
      g,
      { kind: 'adjust_actual', delta: 10 },
      record({ actualValue: 120, completed: true, completedAt: original }),
    );
    // Climbing from 120 to 130 must not rewrite when the goal was first hit.
    expect(p.completedAt).toBe(original);
  });

  it('stamps the moment the target is first crossed', () => {
    const g = measured('numeric', 100);
    const p = plan(g, { kind: 'adjust_actual', delta: 100 }, record({ actualValue: 20 }));
    expect(p.completedAt).toBe(NOW.toISOString());
  });

  it('clears a record back to the empty shape but keeps its notes', () => {
    const g = measured('numeric', 100);
    const p = plan(g, { kind: 'clear' }, record({ actualValue: 80, completed: true, notes: 'felt good' }));
    expect(p).toMatchObject({ completed: false, actualValue: null, completedAt: null, notes: 'felt good' });
  });
});

/* -------------------------------------------------------------------------- */
/* goal introspection + steps                                                  */
/* -------------------------------------------------------------------------- */

describe('goal classification', () => {
  it('knows which goals are measured', () => {
    expect(isMeasuredGoal(measured('numeric', 10))).toBe(true);
    expect(isMeasuredGoal(measured('duration', 30, 'min'))).toBe(true);
    expect(isMeasuredGoal(measured('count', 5))).toBe(true);
    expect(isMeasuredGoal(goal())).toBe(false);
    expect(isMeasuredGoal(goal({ type: 'time' }))).toBe(false);
  });

  it('knows which goals are deadlines', () => {
    expect(isDeadlineGoal(goal({ type: 'time' }))).toBe(true);
    expect(isDeadlineGoal(goal())).toBe(false);
  });

  it('has no numeric target for an unmeasured goal', () => {
    expect(targetOf(goal())).toBeNull();
    expect(targetOf(measured('count', 12))).toBe(12);
  });
});

describe('step suggestions', () => {
  it('steps in units that suit the goal', () => {
    expect(suggestStep(goal())).toBe(1);
    expect(suggestStep(measured('duration', 20, 'min'))).toBe(5);
    expect(suggestStep(measured('duration', 60, 'min'))).toBe(10);
    expect(suggestStep(measured('count', 5))).toBe(5);
    expect(suggestStep(measured('count', 50))).toBe(10);
  });

  it('steps a numeric goal by a readable fraction of its target', () => {
    expect(suggestStep(measured('numeric', 30, 'pages'))).toBe(3);
    expect(suggestStep(measured('numeric', 3, 'km'))).toBe(0.75);
  });

  it('never suggests a step of zero', () => {
    for (const target of [1, 0.5, 0.25, 2, 100]) {
      expect(suggestStep(measured('numeric', target))).toBeGreaterThan(0);
    }
  });
});

describe('predicting lateness before the write', () => {
  it('reports a deadline goal as late once the time has passed', () => {
    const g = goal({ type: 'time', targetTime: '09:00' });
    expect(wouldBeLate(g, new Date('2026-09-29T10:00:00Z'), TZ)).toBe(true);
    expect(wouldBeLate(g, new Date('2026-09-29T08:00:00Z'), TZ)).toBe(false);
  });

  it('never reports a non-deadline goal as late', () => {
    expect(wouldBeLate(goal(), new Date('2026-09-29T23:00:00Z'), TZ)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* materialiseRecord                                                            */
/* -------------------------------------------------------------------------- */

describe('materialising an optimistic record', () => {
  it('produces the same shape the database returns', () => {
    const g = goal();
    const p = planRecord(g, null, DATE, { kind: 'toggle', completed: true }, { timeZone: TZ, now: NOW });
    const materialised = materialiseRecord(g, p, null, NOW);

    expect(materialised).toEqual({
      id: 'optimistic',
      goalId: 'g1',
      userId: 'u1',
      date: DATE,
      completed: true,
      actualValue: null,
      notes: null,
      completedAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it('keeps the identity and creation time of an existing record', () => {
    const g = goal();
    const existing = record({ id: 'real-id', createdAt: '2026-09-01T00:00:00Z' });
    const p = planRecord(g, existing, DATE, { kind: 'toggle', completed: true }, { timeZone: TZ, now: NOW });
    const materialised = materialiseRecord(g, p, existing, NOW);

    expect(materialised.id).toBe('real-id');
    expect(materialised.createdAt).toBe('2026-09-01T00:00:00Z');
  });

  it('round-trips back to the same completion decision', () => {
    // This is the invariant the optimistic UI depends on: what the user sees
    // instantly must be what the server will hold.
    const g = measured('numeric', 100, 'steps');
    const p = planRecord(g, null, DATE, { kind: 'adjust_actual', delta: 40 }, { timeZone: TZ, now: NOW });
    const resolved = resolveGoalDay(g, materialiseRecord(g, p, null, NOW), options);

    expect(resolved.completed).toBe(false);
    expect(resolved.progress).toBeCloseTo(0.4);
    expect(resolved.status).toBe('partial');
  });
});
