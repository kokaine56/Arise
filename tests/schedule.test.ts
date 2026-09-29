import { describe, expect, it } from 'vitest';
import {
  clockToMinutes,
  isEligibleOn,
  isLateCompletion,
  isPastDeadline,
  isScheduledOn,
  isValidClock,
  minutesToClock,
  nextScheduledDay,
  previousScheduledDay,
  scheduleLabel,
  scheduleLabelLong,
  scheduledDaysBetween,
  wasScheduledOn,
} from '@/lib/date/schedule';
import type { CivilDate } from '@/lib/date/civil';
import type { FrequencyConfig, Goal } from '@/types/goal';

/**
 * September 2026 reference: the 27th is a Sunday, so the 28th is a Monday and
 * the 29th a Tuesday. All weekday expectations below are anchored to that.
 */
const SUN = '2026-09-27' as CivilDate;
const MON = '2026-09-28' as CivilDate;
const TUE = '2026-09-29' as CivilDate;
const SAT = '2026-10-03' as CivilDate;

/** Brand a plain literal as a CivilDate. */
const d = (date: string) => date as CivilDate;

/** Scheduling only needs a few fields; build a full goal for readability. */
const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  userId: 'u1',
  name: 'Walk',
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

const weekly = (everyWeeks: number): FrequencyConfig => ({ kind: 'weekly', everyWeeks });
const interval = (everyNDays: number): FrequencyConfig => ({ kind: 'custom_interval', everyNDays });

describe('daily schedules', () => {
  it('includes every day', () => {
    const g = goal();
    expect(isScheduledOn(g, MON)).toBe(true);
    expect(isScheduledOn(g, SUN)).toBe(true);
    expect(isScheduledOn(g, SAT)).toBe(true);
  });
});

describe('weekday schedules', () => {
  it('excludes weekends for weekdays', () => {
    const g = goal({ frequencyType: 'weekdays', frequencyConfig: { kind: 'weekdays' } });
    expect(isScheduledOn(g, MON)).toBe(true);
    expect(isScheduledOn(g, TUE)).toBe(true);
    expect(isScheduledOn(g, SAT)).toBe(false);
    expect(isScheduledOn(g, SUN)).toBe(false);
  });

  it('includes only the weekend for weekends', () => {
    const g = goal({ frequencyType: 'weekends', frequencyConfig: { kind: 'weekends' } });
    expect(isScheduledOn(g, SAT)).toBe(true);
    expect(isScheduledOn(g, SUN)).toBe(true);
    expect(isScheduledOn(g, MON)).toBe(false);
    expect(isScheduledOn(g, TUE)).toBe(false);
  });
});

describe('selected-day schedules', () => {
  const g = goal({
    frequencyType: 'selected_days',
    frequencyConfig: { kind: 'selected_days', days: [1, 3, 5] },
  });

  it('includes only the chosen days', () => {
    expect(isScheduledOn(g, MON)).toBe(true); // ISO 1
    expect(isScheduledOn(g, TUE)).toBe(false); // ISO 2
    expect(isScheduledOn(g, SAT)).toBe(false); // ISO 6
  });
});

describe('weekly schedules', () => {
  it('repeats every seven days from the start date', () => {
    const g = goal({ frequencyConfig: weekly(1), startDate: TUE });
    expect(isScheduledOn(g, TUE)).toBe(true);
    expect(isScheduledOn(g, d('2026-10-06'))).toBe(true);
    expect(isScheduledOn(g, d('2026-10-13'))).toBe(true);
    expect(isScheduledOn(g, d('2026-10-07'))).toBe(false);
  });

  it('skips a week when everyWeeks is greater than one', () => {
    const g = goal({ frequencyConfig: weekly(2), startDate: TUE });
    expect(isScheduledOn(g, TUE)).toBe(true);
    expect(isScheduledOn(g, d('2026-10-06'))).toBe(false);
    expect(isScheduledOn(g, d('2026-10-13'))).toBe(true);
  });

  it('treats a nonsensical interval as one week rather than dividing by zero', () => {
    const g = goal({ frequencyConfig: weekly(0), startDate: TUE });
    expect(isScheduledOn(g, d('2026-10-06'))).toBe(true);
  });
});

describe('custom interval schedules', () => {
  it('counts from the start date', () => {
    const g = goal({ frequencyConfig: interval(3), startDate: TUE });
    expect(isScheduledOn(g, TUE)).toBe(true);
    expect(isScheduledOn(g, d('2026-10-02'))).toBe(true);
    expect(isScheduledOn(g, d('2026-10-05'))).toBe(true);
    expect(isScheduledOn(g, d('2026-10-01'))).toBe(false);
  });

  it('never fires before the start date', () => {
    const g = goal({ frequencyConfig: interval(2), startDate: TUE });
    expect(isScheduledOn(g, SUN)).toBe(false);
    expect(isScheduledOn(g, MON)).toBe(false);
  });
});

describe('the goal lifecycle window', () => {
  it('is not scheduled before its start date', () => {
    const g = goal({ startDate: TUE });
    expect(isScheduledOn(g, MON)).toBe(false);
    expect(isScheduledOn(g, TUE)).toBe(true);
  });

  it('is not scheduled after its end date', () => {
    const g = goal({ endDate: MON });
    expect(isScheduledOn(g, MON)).toBe(true);
    expect(isScheduledOn(g, TUE)).toBe(false);
  });

  it('honours both bounds at once', () => {
    const g = goal({ startDate: MON, endDate: TUE });
    expect(isScheduledOn(g, SUN)).toBe(false);
    expect(isScheduledOn(g, MON)).toBe(true);
    expect(isScheduledOn(g, TUE)).toBe(true);
    expect(isScheduledOn(g, d('2026-09-30'))).toBe(false);
  });
});

describe('paused and archived goals', () => {
  it('drops a paused goal out of the live day', () => {
    const paused = goal({ isActive: false });
    expect(isEligibleOn(paused, TUE)).toBe(false);
  });

  it('keeps a paused goal in history, so past records still make sense', () => {
    const paused = goal({ isActive: false });
    expect(wasScheduledOn(paused, TUE)).toBe(true);
  });

  it('keeps an archived goal in history too', () => {
    const archived = goal({ isActive: false, archivedAt: '2026-09-20T00:00:00Z' });
    expect(isEligibleOn(archived, TUE)).toBe(false);
    expect(wasScheduledOn(archived, TUE)).toBe(true);
  });
});

describe('iteration over scheduled days', () => {
  it('lists only the matching days in a range', () => {
    const g = goal({ frequencyType: 'weekdays', frequencyConfig: { kind: 'weekdays' } });
    expect(scheduledDaysBetween(g, SAT, d('2026-10-07'))).toEqual([d('2026-10-05'), d('2026-10-06'), d('2026-10-07')]);
  });

  it('finds the next scheduled day, inclusive of the starting day', () => {
    const g = goal({ frequencyType: 'weekends', frequencyConfig: { kind: 'weekends' } });
    expect(nextScheduledDay(g, MON)).toBe('2026-10-03');
    expect(nextScheduledDay(g, SAT)).toBe(SAT);
  });

  it('finds the previous scheduled day, exclusive of the starting day', () => {
    const g = goal({ frequencyType: 'weekends', frequencyConfig: { kind: 'weekends' } });
    expect(previousScheduledDay(g, MON)).toBe('2026-09-27');
    expect(previousScheduledDay(g, SAT)).toBe(SUN);
  });

  it('walks back to the nearest match, not the oldest in the scan window', () => {
    // The daily goal has been running since January. The answer must be the day
    // immediately before `from`, never a date hundreds of days earlier.
    const g = goal();
    expect(previousScheduledDay(g, TUE)).toBe(MON);
    expect(previousScheduledDay(g, d('2026-09-01'))).toBe(d('2026-08-31'));
  });

  it('does not loop forever on a schedule that can never come round', () => {
    // A goal that ended in the past has no future days at all.
    const g = goal({ endDate: MON });
    expect(nextScheduledDay(g, TUE)).toBeNull();
  });
});

describe('schedule labels', () => {
  it('names the simple frequencies', () => {
    expect(scheduleLabel(goal())).toBe('Every day');
    expect(scheduleLabel(goal({ frequencyType: 'weekdays', frequencyConfig: { kind: 'weekdays' } }))).toBe(
      'Every weekday',
    );
    expect(scheduleLabel(goal({ frequencyType: 'weekends', frequencyConfig: { kind: 'weekends' } }))).toBe(
      'Every weekend',
    );
  });

  it('collapses whole-week and whole-day cases', () => {
    expect(
      scheduleLabel(goal({ frequencyType: 'weekly', frequencyConfig: weekly(1) })),
    ).toBe('Every week');
    expect(
      scheduleLabel(goal({ frequencyType: 'weekly', frequencyConfig: weekly(3) })),
    ).toBe('Every 3 weeks');
    expect(
      scheduleLabel(goal({ frequencyType: 'custom_interval', frequencyConfig: interval(1) })),
    ).toBe('Every day');
    expect(
      scheduleLabel(goal({ frequencyType: 'custom_interval', frequencyConfig: interval(5) })),
    ).toBe('Every 5 days');
  });

  it('lists chosen days in week order regardless of input order', () => {
    const g = goal({
      frequencyType: 'selected_days',
      frequencyConfig: { kind: 'selected_days', days: [5, 1, 3] },
    });
    expect(scheduleLabel(g)).toBe('Mon, Wed, Fri');
    expect(scheduleLabelLong(g)).toBe('Monday, Wednesday, Friday');
  });

  it('explains an empty day selection rather than showing nothing', () => {
    const g = goal({ frequencyType: 'selected_days', frequencyConfig: { kind: 'selected_days', days: [] } });
    expect(scheduleLabel(g)).toBe('No days selected');
  });
});

describe('clock helpers', () => {
  it('validates a wall-clock time', () => {
    expect(isValidClock('00:00')).toBe(true);
    expect(isValidClock('23:59')).toBe(true);
    expect(isValidClock('24:00')).toBe(false);
    expect(isValidClock('12:60')).toBe(false);
    expect(isValidClock('9:30')).toBe(false);
    expect(isValidClock(null)).toBe(false);
    expect(isValidClock(930)).toBe(false);
  });

  it('converts to minutes since midnight', () => {
    expect(clockToMinutes('00:00')).toBe(0);
    expect(clockToMinutes('09:05')).toBe(545);
    expect(clockToMinutes('22:00')).toBe(1320);
  });

  it('sorts unparseable input late instead of dividing by zero', () => {
    expect(clockToMinutes('nonsense')).toBe(Number.POSITIVE_INFINITY);
    expect(clockToMinutes(null)).toBe(Number.POSITIVE_INFINITY);
  });

  it('converts minutes back to a padded clock', () => {
    expect(minutesToClock(0)).toBe('00:00');
    expect(minutesToClock(545)).toBe('09:05');
    expect(minutesToClock(1320)).toBe('22:00');
  });

  it('wraps rather than overflowing', () => {
    expect(minutesToClock(1440)).toBe('00:00');
    expect(minutesToClock(1500)).toBe('01:00');
    expect(minutesToClock(-60)).toBe('23:00');
  });
});

describe('time-of-day deadlines', () => {
  // 22:00 in New York on 2026-09-29 is 02:00 UTC on 2026-09-30.
  const TZ = 'America/New_York';
  const beforeDeadline = new Date('2026-09-30T01:00:00Z');
  const exactlyOnDeadline = new Date('2026-09-30T02:00:00Z');
  const afterDeadline = new Date('2026-09-30T03:00:00Z');

  it('knows when a deadline has passed in the local zone', () => {
    expect(isPastDeadline('22:00', TZ, beforeDeadline)).toBe(false);
    expect(isPastDeadline('22:00', TZ, exactlyOnDeadline)).toBe(false);
    expect(isPastDeadline('22:00', TZ, afterDeadline)).toBe(true);
  });

  it('ignores a goal with no deadline at all', () => {
    expect(isPastDeadline(null, TZ, afterDeadline)).toBe(false);
    expect(isPastDeadline('nonsense', TZ, afterDeadline)).toBe(false);
  });

  it('treats an on-time completion as not late', () => {
    expect(isLateCompletion('22:00', beforeDeadline.toISOString(), TZ)).toBe(false);
  });

  it('treats a past-deadline completion as late, not failed', () => {
    expect(isLateCompletion('22:00', afterDeadline.toISOString(), TZ)).toBe(true);
  });

  it('projects the instant into the user zone before comparing', () => {
    // 02:00 UTC is 22:00 in New York — exactly on the deadline, so not late.
    // Comparing the UTC wall-clock (02:00) against 22:00 would get this wrong.
    expect(isLateCompletion('22:00', exactlyOnDeadline.toISOString(), TZ)).toBe(false);
  });

  it('is not late with no deadline, no completion, or an unusable time', () => {
    expect(isLateCompletion(null, afterDeadline.toISOString(), TZ)).toBe(false);
    expect(isLateCompletion('22:00', null, TZ)).toBe(false);
    expect(isLateCompletion('nonsense', afterDeadline.toISOString(), TZ)).toBe(false);
    expect(isLateCompletion('22:00', 'nonsense', TZ)).toBe(false);
  });
});
