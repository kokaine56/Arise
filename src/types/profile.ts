import type { CivilDate } from '@/lib/date/civil';

export type ThemePreference = 'dark' | 'light' | 'system';
export type WeekStart = 1 | 7;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEK_START_OPTIONS: ReadonlyArray<{ value: WeekStart; label: string }> = [
  { value: 1, label: 'Monday' },
  { value: 7, label: 'Sunday' },
];

export interface AppSettings {
  weekStartsOn: WeekStart;
  /** Opt-in master switch for reminders. Individual goals can still hold a
   *  reminder time; this only gates whether Arise would ever fire one. */
  notificationsEnabled: boolean;
  /** Pre-fill the time field when creating a time-based goal. */
  defaultReminderTime: string | null;
  /** Reuse the last used target when creating a similar goal. */
  defaultUnit: string | null;
  /** Hide goals that were never touched on a past day. */
  hideEmptyHistoryDays: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  weekStartsOn: 1,
  notificationsEnabled: false,
  defaultReminderTime: null,
  defaultUnit: null,
  hideEmptyHistoryDays: true,
};

export interface Profile {
  id: string;
  userId: string;
  displayName: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export type { CivilDate };
