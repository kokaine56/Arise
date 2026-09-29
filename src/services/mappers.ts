/**
 * Row → domain mapping.
 *
 * The database speaks `snake_case`, JSONB and `numeric`. The app speaks
 * camelCase and discriminated unions. Every conversion between the two lives
 * here, and every field is parsed defensively — a malformed JSONB payload from
 * an older migration must degrade to a sane default, never crash the dashboard.
 */

import { parseCivilDate, toCivilDate } from '@/lib/date/civil';
import { isValidClock } from '@/lib/date/schedule';
import type { Json } from '@/lib/api/types';
import type { DailyGoalRecordRow, GoalRow, ProfileRow, UserSettingRow } from '@/lib/api/types';
import type { DailyRecord } from '@/types/dailyRecord';
import type { AppSettings, Profile } from '@/types/profile';
import type { FrequencyConfig, Goal, GoalType, IsoDay } from '@/types/goal';
import { ISO_DAYS } from '@/types/goal';

/* -------------------------------------------------------------------------- */
/* Goals                                                                      */
/* -------------------------------------------------------------------------- */

const MEASURED_TYPES = new Set<GoalType>(['numeric', 'duration', 'count']);

export const isMeasuredType = (type: GoalType): boolean => MEASURED_TYPES.has(type);

/** Types where a target magnitude is meaningful and required. */
export const requiresTarget = (type: GoalType): boolean => MEASURED_TYPES.has(type);

const isGoalType = (value: unknown): value is GoalType =>
  typeof value === 'string' &&
  ['checkbox', 'numeric', 'duration', 'count', 'time'].includes(value);

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asIsoDays = (value: unknown): IsoDay[] => {
  if (!Array.isArray(value)) return [];
  const days = value
    .map((entry) => Number(entry))
    .filter((entry): entry is IsoDay => ISO_DAYS.includes(entry as IsoDay));
  return [...new Set(days)].sort((a, b) => a - b);
};

/**
 * JSONB → `FrequencyConfig`. Falls back to `daily` rather than throwing: a
 * single bad row must not take down the whole day.
 */
export const parseFrequencyConfig = (
  frequencyType: string,
  raw: Json | null | undefined,
): FrequencyConfig => {
  const payload = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    Json | undefined
  >;
  const positiveInt = (key: string, fallback: number): number => {
    const parsed = Number(payload[key]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };

  switch (frequencyType) {
    case 'weekdays':
      return { kind: 'weekdays' };
    case 'weekends':
      return { kind: 'weekends' };
    case 'selected_days': {
      const days = asIsoDays(payload['days']);
      return { kind: 'selected_days', days: days.length > 0 ? days : [1] };
    }
    case 'weekly':
      return { kind: 'weekly', everyWeeks: positiveInt('everyWeeks', 1) };
    case 'custom_interval':
      return { kind: 'custom_interval', everyNDays: positiveInt('everyNDays', 2) };
    case 'daily':
    default:
      return { kind: 'daily' };
  }
};

/** `FrequencyConfig` → the JSONB shape the schema's trigger expects. */
export const serialiseFrequencyConfig = (config: FrequencyConfig): Json => {
  switch (config.kind) {
    case 'selected_days':
      return {
        kind: 'selected_days',
        days: [...new Set(config.days)].sort((a, b) => a - b),
      };
    case 'weekly':
      return { kind: 'weekly', everyWeeks: Math.max(1, Math.trunc(config.everyWeeks)) };
    case 'custom_interval':
      return { kind: 'custom_interval', everyNDays: Math.max(1, Math.trunc(config.everyNDays)) };
    case 'weekdays':
    case 'weekends':
    case 'daily':
    default:
      return { kind: config.kind };
  }
};

export const toGoal = (row: GoalRow): Goal => ({
  id: row.id,
  name: row.name,
  description: asString(row.description),
  type: isGoalType(row.goal_type) ? row.goal_type : 'checkbox',
  targetValue: asNumber(row.target_value),
  unit: asString(row.unit),
  targetTime: isValidClock(row.target_time) ? row.target_time : null,
  categoryId: asString(row.category_id),
  frequencyType: row.frequency_type,
  frequencyConfig: parseFrequencyConfig(row.frequency_type, row.frequency_config),
  startDate: parseCivilDate(row.start_date),
  endDate: toCivilDate(row.end_date),
  reminderTime: isValidClock(row.reminder_time) ? row.reminder_time : null,
  isActive: row.is_active,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  archivedAt: asString(row.archived_at),
});

/* -------------------------------------------------------------------------- */
/* Daily records                                                              */
/* -------------------------------------------------------------------------- */

export const toDailyRecord = (row: DailyGoalRecordRow): DailyRecord => ({
  id: row.id,
  goalId: row.goal_id,
  date: parseCivilDate(row.date),
  completed: row.completed,
  actualValue: asNumber(row.actual_value),
  notes: asString(row.notes),
  completedAt: asString(row.completed_at),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/* -------------------------------------------------------------------------- */
/* Profile & settings                                                         */
/* -------------------------------------------------------------------------- */

export const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  displayName: row.display_name,
  timezone: row.timezone,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const toSettings = (row: UserSettingRow): AppSettings => ({
  weekStartsOn: (row.week_starts_on === 7 ? 7 : 1),
  notificationsEnabled: row.notifications_enabled,
  defaultReminderTime: isValidClock(row.default_reminder_time) ? row.default_reminder_time : null,
  defaultUnit: asString(row.default_unit),
  hideEmptyHistoryDays: row.hide_empty_history_days,
});
