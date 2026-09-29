/**
 * Domain model for recurring health goals.
 *
 * The central distinction this codebase enforces everywhere:
 *   - A `Goal` is a permanent *definition*. It is never "today's completion".
 *   - A `DailyRecord` is the *completion* of one goal on one civil date.
 *
 * All date-shaped values are civil dates (`YYYY-MM-DD` in the user's own
 * timezone) rather than instants, so scheduling arithmetic is immune to DST.
 */

import type { CivilDate } from '@/lib/date/civil';

export const GOAL_TYPES = ['checkbox', 'numeric', 'duration', 'count', 'time'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  checkbox: 'Checkbox',
  numeric: 'Numeric',
  duration: 'Duration',
  count: 'Count',
  time: 'Time',
};

/** One-line explanation shown under the type picker. */
export const GOAL_TYPE_HINTS: Record<GoalType, string> = {
  checkbox: 'Did you do it, yes or no.',
  numeric: 'Track a measurement against a target.',
  duration: 'Track minutes against a target.',
  count: 'Track repetitions against a count.',
  time: 'Do this before a time of day.',
};

export const CATEGORIES = [
  'fitness',
  'nutrition',
  'sleep',
  'mindfulness',
  'personal',
  'learning',
  'health',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  fitness: 'Fitness',
  nutrition: 'Nutrition',
  sleep: 'Sleep',
  mindfulness: 'Mindfulness',
  personal: 'Personal',
  learning: 'Learning',
  health: 'Health',
  other: 'Other',
};

export const FREQUENCY_TYPES = [
  'daily',
  'weekdays',
  'weekends',
  'selected_days',
  'weekly',
  'custom_interval',
] as const;
export type FrequencyType = (typeof FREQUENCY_TYPES)[number];

/**
 * ISO day numbering: Monday = 1 … Sunday = 7.
 * Matches the `frequency_config` shape documented in the schema.
 */
export const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type IsoDay = (typeof ISO_DAYS)[number];

export const DAY_LABELS: Record<IsoDay, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

export const DAY_LABELS_LONG: Record<IsoDay, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

/**
 * How a goal recurs. `weekly` and `custom_interval` are anchored to the goal's
 * own `startDate`, so the anchor is not duplicated here.
 */
export type FrequencyConfig =
  | { kind: 'daily' }
  | { kind: 'weekdays' }
  | { kind: 'weekends' }
  | { kind: 'selected_days'; days: IsoDay[] }
  | { kind: 'weekly'; everyWeeks: number }
  | { kind: 'custom_interval'; everyNDays: number };

export const FREQUENCY_LABELS: Record<FrequencyType, string> = {
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekends: 'Weekends',
  selected_days: 'Specific days',
  weekly: 'Weekly',
  custom_interval: 'Custom',
};

/**
 * The recurring definition. Never mutated by a daily completion.
 *
 * `categoryId` is a reference rather than an inline slug so custom categories
 * can be added later without a migration. Built-in slugs are seeded per user at
 * signup and exposed as `CATEGORIES` for the default.
 */
export interface Goal {
  id: string;
  name: string;
  description: string | null;
  type: GoalType;
  /** Target magnitude. Minutes for `duration`. Null for `checkbox`/`time`. */
  targetValue: number | null;
  unit: string | null;
  /** `HH:MM` local time deadline, for `time` goals. */
  targetTime: string | null;
  categoryId: string | null;
  frequencyType: FrequencyType;
  frequencyConfig: FrequencyConfig;
  startDate: CivilDate;
  endDate: CivilDate | null;
  /** `HH:MM` local, opt-in. */
  reminderTime: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type GoalDayStatus = 'completed' | 'partial' | 'open';

/**
 * The normalised unit of the daily checklist: a scheduled goal merged with its
 * record for one date. This is the only shape the UI consumes.
 */
export interface ResolvedGoal {
  goalId: string;
  name: string;
  type: GoalType;
  categoryId: string | null;
  target: number | null;
  unit: string | null;
  targetTime: string | null;
  actual: number;
  completed: boolean;
  /** 0–1, clamped. Drives every progress indicator in the product. */
  progress: number;
  status: GoalDayStatus;
  /** `time` goals only: completed after the target time of day. */
  isLate: boolean;
  updatedAt: string | null;
  /** Full definition, for edit affordances. */
  goal: Goal;
}
