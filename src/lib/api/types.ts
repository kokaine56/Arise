/**
 * Row shapes returned by the Arise API.
 *
 * These are the same rows the client used to receive from Supabase, minus the
 * `user_id` that ownership made necessary. Keeping the shape identical means
 * `services/mappers.ts` — the layer that turns rows into domain objects — barely
 * changes, and the domain does not learn that its storage moved.
 *
 * Declared as `type` aliases rather than interfaces so they keep an implicit
 * index signature.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProfileRow = {
  id: number;
  display_name: string;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type UserSettingRow = {
  week_starts_on: number;
  notifications_enabled: boolean;
  default_reminder_time: string | null;
  default_unit: string | null;
  hide_empty_history_days: boolean;
};

export type CategoryRow = {
  id: string;
  slug: string;
  label: string;
  is_builtin: boolean;
  sort_order: number;
};

/** `goals.goal_type` CHECK list. */
export type GoalTypeRow = 'checkbox' | 'numeric' | 'duration' | 'count' | 'time';
/** `goals.frequency_type` CHECK list. */
export type FrequencyTypeRow =
  | 'daily'
  | 'weekdays'
  | 'weekends'
  | 'selected_days'
  | 'weekly'
  | 'custom_interval';

export type GoalRow = {
  id: string;
  name: string;
  description: string | null;
  goal_type: GoalTypeRow;
  target_value: number | null;
  unit: string | null;
  target_time: string | null;
  category_id: string | null;
  frequency_type: FrequencyTypeRow;
  frequency_config: Json;
  start_date: string;
  end_date: string | null;
  reminder_time: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type DailyGoalRecordRow = {
  id: string;
  goal_id: string;
  date: string;
  completed: boolean;
  actual_value: number | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
