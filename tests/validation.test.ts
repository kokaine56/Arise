import { describe, expect, it } from 'vitest';
import { parseGoalForm, toGoalInput, type GoalDraft } from '@/lib/validation/goal';

const draft = (overrides: Partial<GoalDraft> = {}): GoalDraft => ({
  type: 'checkbox',
  name: 'Walk the dog',
  description: '',
  targetValue: '',
  unit: null,
  targetTime: '',
  categoryId: null,
  frequencyType: 'daily',
  frequencyConfig: { kind: 'daily' },
  startDate: '2026-09-29',
  endDate: null,
  reminderTime: null,
  isActive: true,
  ...overrides,
});

const errors = (overrides: Partial<GoalDraft> = {}): Record<string, string | undefined> => {
  const result = parseGoalForm(draft(overrides));
  if (result.success) throw new Error('expected the draft to be rejected');
  return result.errors;
};

const parsed = (overrides: Partial<GoalDraft> = {}) => {
  const result = parseGoalForm(draft(overrides));
  if (!result.success) throw new Error(`expected a valid draft, got ${JSON.stringify(result.errors)}`);
  return result.data;
};

describe('naming', () => {
  it('accepts a normal name', () => {
    expect(parsed().name).toBe('Walk the dog');
  });

  it('trims surrounding whitespace', () => {
    expect(parsed({ name: '  Walk the dog  ' }).name).toBe('Walk the dog');
  });

  it('rejects a blank name', () => {
    expect(errors({ name: '   ' }).name).toBeTruthy();
  });

  it('rejects an overlong name', () => {
    expect(errors({ name: 'x'.repeat(61) }).name).toBeTruthy();
    expect(parsed({ name: 'x'.repeat(60) }).name).toHaveLength(60);
  });
});

describe('the frequency pair must agree', () => {
  it('rejects a config that contradicts the chosen type', () => {
    // The most likely bug in this form: switching tabs without switching config.
    const result = errors({
      frequencyType: 'weekdays',
      frequencyConfig: { kind: 'daily' },
    });
    expect(result.frequencyType).toBe('Choose how often this repeats');
  });

  it('accepts a matching pair', () => {
    expect(parsed({ frequencyType: 'weekdays', frequencyConfig: { kind: 'weekdays' } }).frequencyType).toBe(
      'weekdays',
    );
  });

  it('requires at least one selected day', () => {
    expect(errors({ frequencyType: 'selected_days', frequencyConfig: { kind: 'selected_days', days: [] } })).toBeTruthy();
  });

  it('keeps the weekly interval within a year', () => {
    expect(
      parsed({ frequencyType: 'weekly', frequencyConfig: { kind: 'weekly', everyWeeks: 52 } }).frequencyConfig,
    ).toEqual({ kind: 'weekly', everyWeeks: 52 });
    expect(
      errors({ frequencyType: 'weekly', frequencyConfig: { kind: 'weekly', everyWeeks: 53 } }),
    ).toBeTruthy();
  });

  it('keeps the custom interval within a year', () => {
    expect(
      parsed({
        frequencyType: 'custom_interval',
        frequencyConfig: { kind: 'custom_interval', everyNDays: 365 },
      }).frequencyConfig,
    ).toEqual({ kind: 'custom_interval', everyNDays: 365 });
    expect(
      errors({
        frequencyType: 'custom_interval',
        frequencyConfig: { kind: 'custom_interval', everyNDays: 366 },
      }),
    ).toBeTruthy();
  });
});

describe('dates', () => {
  it('rejects an impossible start date', () => {
    expect(errors({ startDate: '2026-02-30' }).startDate).toBe('Use a date like 2026-09-29');
  });

  it('rejects an end date before the start', () => {
    expect(errors({ startDate: '2026-09-29', endDate: '2026-09-28' }).endDate).toBe(
      'The end date must be on or after the start date',
    );
  });

  it('accepts an end date equal to the start date', () => {
    expect(parsed({ startDate: '2026-09-29', endDate: '2026-09-29' }).endDate).toBe('2026-09-29');
  });
});

describe('times', () => {
  it('accepts a 24-hour clock time', () => {
    expect(parsed({ type: 'time', targetTime: '21:30' }).type).toBe('time');
  });

  it('rejects an out-of-range time', () => {
    expect(errors({ type: 'time', targetTime: '24:00' }).targetTime).toBeTruthy();
    expect(errors({ type: 'time', targetTime: '9:30' }).targetTime).toBeTruthy();
  });

  it('requires a time on a time goal', () => {
    expect(errors({ type: 'time', targetTime: '' }).targetTime).toBeTruthy();
  });

  it('treats an empty reminder as no reminder', () => {
    // A cleared time input holds '', which must not fail the clock pattern.
    expect(parsed({ reminderTime: '' }).reminderTime).toBeNull();
    expect(parsed({ reminderTime: '   ' }).reminderTime).toBeNull();
    expect(parsed({ reminderTime: null }).reminderTime).toBeNull();
    expect(parsed({ reminderTime: '08:00' }).reminderTime).toBe('08:00');
  });

  it('treats an empty end date as no end date', () => {
    expect(parsed({ endDate: '' }).endDate).toBeNull();
    expect(parsed({ endDate: null }).endDate).toBeNull();
  });

  it('treats an empty unit as no unit', () => {
    const result = parsed({ type: 'numeric', targetValue: '5', unit: '' });
    expect(result.type).toBe('numeric');
    if (result.type === 'numeric') expect(result.unit).toBeNull();
  });
});

describe('measured goals', () => {
  it('coerces a numeric string into a number', () => {
    const result = parsed({ type: 'numeric', targetValue: '30', unit: 'pages' });
    expect(result.type).toBe('numeric');
    if (result.type === 'numeric') expect(result.targetValue).toBe(30);
  });

  it('rejects an empty target with a useful message', () => {
    // The form holds strings, so a blank box must not surface as a type error.
    expect(errors({ type: 'numeric', targetValue: '' }).targetValue).toBe('Enter a target above zero');
  });

  it('rejects a zero or negative target', () => {
    expect(errors({ type: 'numeric', targetValue: '0' }).targetValue).toBeTruthy();
    expect(errors({ type: 'numeric', targetValue: '-5' }).targetValue).toBeTruthy();
  });

  it('requires a whole number for a count', () => {
    expect(errors({ type: 'count', targetValue: '2.5' }).targetValue).toBe('Use a whole number');
    const result = parsed({ type: 'count', targetValue: '3' });
    if (result.type === 'count') expect(result.targetValue).toBe(3);
  });

  it('locks duration to minutes', () => {
    const result = parsed({ type: 'duration', targetValue: '30', unit: 'hours' });
    expect(result.type).toBe('duration');
    if (result.type === 'duration') {
      expect(result.unit).toBe('min');
      expect(result.targetValue).toBe(30);
    }
  });

  it('lets a checkbox carry no target at all', () => {
    const result = parsed({ type: 'checkbox', targetValue: '' });
    expect(result.type).toBe('checkbox');
    if (result.type === 'checkbox') expect(result.targetValue).toBeNull();
  });
});

describe('categories', () => {
  it('accepts a uuid', () => {
    const id = '0b3f5a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b';
    expect(parsed({ categoryId: id }).categoryId).toBe(id);
  });

  it('rejects a non-uuid, which would fail at the database anyway', () => {
    expect(errors({ categoryId: 'fitness' }).categoryId).toBeTruthy();
  });

  it('treats no category as null', () => {
    expect(parsed({ categoryId: null }).categoryId).toBeNull();
  });
});

describe('descriptions', () => {
  it('keeps a real description', () => {
    expect(parsed({ description: '  Around the block  ' }).description).toBe('Around the block');
  });

  it('rejects an overlong description', () => {
    expect(errors({ description: 'x'.repeat(281) }).description).toBeTruthy();
  });
});

describe('converting a valid draft for the service', () => {
  it('sends a numeric goal with a number and no deadline', () => {
    const input = toGoalInput(parsed({ type: 'numeric', targetValue: '8000', unit: 'steps' }));
    expect(input).toMatchObject({
      type: 'numeric',
      targetValue: 8000,
      unit: 'steps',
      targetTime: null,
      endDate: null,
      reminderTime: null,
    });
  });

  it('sends a time goal with no numeric target', () => {
    const input = toGoalInput(parsed({ type: 'time', targetTime: '22:30' }));
    expect(input).toMatchObject({ type: 'time', targetValue: null, unit: null, targetTime: '22:30' });
  });

  it('sends a blank description as null rather than an empty string', () => {
    expect(toGoalInput(parsed({ description: '   ' })).description).toBeNull();
  });

  it('sends a checkbox target as null when none was given', () => {
    expect(toGoalInput(parsed({ type: 'checkbox', targetValue: '' })).targetValue).toBeNull();
  });
});

describe('error reporting', () => {
  it('keys each message by the field the form can highlight', () => {
    const result = errors({ name: '', startDate: 'nope', type: 'numeric', targetValue: '' });
    expect(Object.keys(result).sort()).toEqual(['name', 'startDate', 'targetValue']);
  });

  it('reports only the first message per field', () => {
    const result = errors({ name: '' });
    expect(typeof result.name).toBe('string');
  });

  it('returns no errors for a fully valid draft', () => {
    const result = parseGoalForm(draft());
    expect(result.success).toBe(true);
  });
});
