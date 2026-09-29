import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareCivil,
  diffDays,
  eachDay,
  endOfWeek,
  formatClock,
  formatClockCompact,
  hourOfDayIn,
  isValidCivilDate,
  isoDayOf,
  localTimeIn,
  parseCivilDate,
  startOfMonth,
  startOfWeek,
  toCivilDate,
  todayIn,
} from '@/lib/date/civil';
import type { CivilDate } from '@/lib/date/civil';

/**
 * Civil dates are the backbone of the scheduling model, so these are the tests
 * that matter most: no local timezone, no DST, no off-by-one at month ends.
 */

/** `CivilDate` is a branded string; this brands a literal in a test. */
const d = (date: string) => date as CivilDate;

describe('CivilDate parsing and validation', () => {
  it('accepts a well-formed date', () => {
    expect(isValidCivilDate('2026-09-29')).toBe(true);
  });

  it('rejects a date that does not exist', () => {
    expect(isValidCivilDate('2026-02-30')).toBe(false);
    expect(isValidCivilDate('2026-13-01')).toBe(false);
    expect(isValidCivilDate('2026-00-10')).toBe(false);
  });

  it('rejects anything that is not ISO-shaped', () => {
    expect(isValidCivilDate('29/09/2026')).toBe(false);
    expect(isValidCivilDate('2026-9-29')).toBe(false);
    expect(isValidCivilDate('')).toBe(false);
    expect(isValidCivilDate(null)).toBe(false);
    expect(isValidCivilDate(undefined)).toBe(false);
    expect(isValidCivilDate(20260929)).toBe(false);
  });

  it('parses a valid date and throws on an invalid one', () => {
    expect(parseCivilDate('2026-09-29')).toBe('2026-09-29');
    expect(() => parseCivilDate('nonsense')).toThrow();
  });

  it('returns null rather than throwing for a nullable parse', () => {
    expect(toCivilDate('2026-09-29')).toBe('2026-09-29');
    expect(toCivilDate('2026-02-30')).toBeNull();
    expect(toCivilDate(null)).toBeNull();
    expect(toCivilDate(undefined)).toBeNull();
  });
});

describe('civil arithmetic', () => {
  it('adds days across a month boundary', () => {
    expect(addDays(d('2026-09-30'), 1)).toBe('2026-10-01');
    expect(addDays(d('2026-10-01'), -1)).toBe('2026-09-30');
  });

  it('adds days across a year boundary', () => {
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(d('2027-01-01'), -1)).toBe('2026-12-31');
  });

  it('handles a leap day', () => {
    expect(addDays(d('2028-02-28'), 1)).toBe('2028-02-29');
    expect(addDays(d('2028-02-29'), 1)).toBe('2028-03-01');
    // 2026 is not a leap year, so the day simply does not exist.
    expect(isValidCivilDate('2026-02-29')).toBe(false);
  });

  it('is unaffected by the machine timezone', () => {
    // A DST transition in most zones would break this if it went through Date.
    expect(addDays(d('2026-03-08'), 1)).toBe('2026-03-09');
    expect(addDays(d('2026-11-01'), 1)).toBe('2026-11-02');
  });

  it('counts the distance between two dates inclusively of neither end', () => {
    expect(diffDays(d('2026-09-01'), d('2026-09-08'))).toBe(7);
    expect(diffDays(d('2026-09-08'), d('2026-09-01'))).toBe(-7);
    expect(diffDays(d('2026-09-01'), d('2026-09-01'))).toBe(0);
  });

  it('orders dates', () => {
    expect(compareCivil(d('2026-09-01'), d('2026-09-02'))).toBeLessThan(0);
    expect(compareCivil(d('2026-09-02'), d('2026-09-01'))).toBeGreaterThan(0);
    expect(compareCivil(d('2026-09-01'), d('2026-09-01'))).toBe(0);
  });

  it('enumerates an inclusive range', () => {
    expect(eachDay(d('2026-09-29'), d('2026-10-02'))).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('returns a single day for a one-day range', () => {
    expect(eachDay(d('2026-09-29'), d('2026-09-29'))).toEqual(['2026-09-29']);
  });
});

describe('weekday derivation', () => {
  // 2026-09-28 is a Monday, so the 29th is a Tuesday and the 27th a Sunday.
  it('uses ISO numbering, Monday = 1', () => {
    expect(isoDayOf(d('2026-09-28'))).toBe(1);
    expect(isoDayOf(d('2026-09-29'))).toBe(2);
    expect(isoDayOf(d('2026-10-03'))).toBe(6); // Saturday
    expect(isoDayOf(d('2026-10-04'))).toBe(7); // Sunday
  });

  it('starts a week on Monday when asked', () => {
    expect(startOfWeek(d('2026-09-29'), 1)).toBe('2026-09-28');
    expect(endOfWeek(d('2026-09-29'), 1)).toBe('2026-10-04');
  });

  it('starts a week on Sunday when asked', () => {
    expect(startOfWeek(d('2026-09-29'), 7)).toBe('2026-09-27');
    expect(endOfWeek(d('2026-09-29'), 7)).toBe('2026-10-03');
  });

  it('leaves a date that is already a week start alone', () => {
    expect(startOfWeek(d('2026-09-28'), 1)).toBe('2026-09-28');
    expect(startOfWeek(d('2026-09-27'), 7)).toBe('2026-09-27');
  });

  it('keeps the whole week inside one calendar week for every weekday', () => {
    // A regression guard: the Sunday-start offset was once computed as
    // `7 - iso`, which slid every non-Sunday week backwards by the wrong amount.
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(d('2026-09-27'), offset); // 27th is a Sunday

      const mondayWeek = eachDay(startOfWeek(date, 1), endOfWeek(date, 1));
      expect(mondayWeek).toHaveLength(7);
      expect(isoDayOf(mondayWeek[0]!)).toBe(1);
      expect(isoDayOf(mondayWeek[6]!)).toBe(7);

      const sundayWeek = eachDay(startOfWeek(date, 7), endOfWeek(date, 7));
      expect(sundayWeek).toHaveLength(7);
      expect(isoDayOf(sundayWeek[0]!)).toBe(7);
      expect(isoDayOf(sundayWeek[6]!)).toBe(6);
    }
  });
});

describe('timezones', () => {
  it('resolves today from the profile timezone, not the device', () => {
    // 03:30 UTC is already the 30th in Auckland and still the 29th in New York.
    const instant = new Date('2026-09-30T03:30:00Z');
    expect(todayIn('Pacific/Auckland', instant)).toBe('2026-09-30');
    expect(todayIn('America/New_York', instant)).toBe('2026-09-29');
    expect(todayIn('UTC', instant)).toBe('2026-09-30');
  });

  it('rolls the date over at local midnight, not at UTC midnight', () => {
    // 02:30 UTC on the 29th: still the 28th in New York, already the 29th in Tokyo.
    const instant = new Date('2026-09-29T02:30:00Z');
    expect(todayIn('America/New_York', instant)).toBe('2026-09-28');
    expect(todayIn('Asia/Tokyo', instant)).toBe('2026-09-29');
  });

  it('falls back to UTC for an unusable timezone rather than throwing', () => {
    const instant = new Date('2026-09-30T03:30:00Z');
    expect(todayIn('Not/AZone', instant)).toBe('2026-09-30');
  });
});

describe('local wall clock', () => {
  // Regression: the formatter output was parsed with a hardcoded ", " split,
  // which yields NaN hours on runtimes that order parts as "Tue 23:00". That
  // silently disabled the greeting, deadline checks, and late detection.
  it('decomposes an instant into the local wall clock', () => {
    expect(localTimeIn('UTC', new Date('2026-09-30T23:15:00Z'))).toEqual({
      hours: 23,
      minutes: 15,
      weekday: 3, // Wednesday
    });
  });

  it('projects into the target zone rather than the host zone', () => {
    // 23:15 UTC on the 29th is 19:15 on the 29th in New York.
    expect(localTimeIn('America/New_York', new Date('2026-09-29T23:15:00Z'))).toEqual({
      hours: 19,
      minutes: 15,
      weekday: 2, // Tuesday
    });
  });

  it('reports midnight as hour 0, never 24', () => {
    // Some engines render local midnight as "24:00" even under h23.
    for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Asia/Kolkata']) {
      // 04:00 UTC on the 30th is midnight in New York.
      const midnight = new Date('2026-09-30T04:00:00Z');
      const local = localTimeIn(zone, midnight);
      expect(local.hours).toBeGreaterThanOrEqual(0);
      expect(local.hours).toBeLessThanOrEqual(23);
      expect(local.minutes).toBeGreaterThanOrEqual(0);
      expect(local.minutes).toBeLessThanOrEqual(59);
    }
  });

  it('never returns NaN, whatever the zone', () => {
    for (const zone of ['UTC', 'Europe/London', 'Asia/Kolkata', 'America/Los_Angeles']) {
      const local = localTimeIn(zone, new Date('2026-03-29T12:00:00Z'));
      expect(Number.isNaN(local.hours)).toBe(false);
      expect(Number.isNaN(local.minutes)).toBe(false);
    }
  });

  it('feeds the greeting without a timezone crash', () => {
    expect(hourOfDayIn('UTC', new Date('2026-09-30T05:00:00Z'))).toBe(5);
    expect(hourOfDayIn('Not/AZone', new Date('2026-09-30T05:00:00Z'))).toBe(5);
  });
});

describe('clock formatting', () => {
  it('renders a 24-hour time as the reader would say it', () => {
    expect(formatClock('21:30')).toBe('9:30 PM');
    expect(formatClock('00:00')).toBe('12:00 AM');
    expect(formatClock('12:00')).toBe('12:00 PM');
    expect(formatClock('09:05')).toBe('9:05 AM');
  });

  it('has a lowercase variant for inline mentions', () => {
    expect(formatClockCompact('21:30')).toBe('9:30 pm');
  });

  it('passes anything malformed through untouched', () => {
    expect(formatClock('nonsense')).toBe('nonsense');
    expect(formatClock(null)).toBe('');
    expect(formatClock(undefined)).toBe('');
  });
});

describe('month helpers', () => {
  it('finds the first of the month', () => {
    expect(startOfMonth(d('2026-09-29'))).toBe('2026-09-01');
  });
});
