/**
 * Hand-maintained mirror of `supabase/migrations/0001_initial_schema.sql`.
 *
 * Kept in the repo rather than generated at build time so the client compiles
 * with full row typing out of the box. Regenerate with:
 *   supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 *
 * Note: rows are declared as `type` aliases, not `interface`. TypeScript only
 * gives object *type aliases* an implicit index signature, and supabase-js
 * requires every row to satisfy `Record<string, unknown>`. Declaring them as
 * interfaces silently degrades every query result to `never`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProfileRow = {
  id: string;
  user_id: string;
  display_name: string;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type UserSettingRow = {
  id: string;
  user_id: string;
  week_starts_on: number;
  notifications_enabled: boolean;
  default_reminder_time: string | null;
  default_unit: string | null;
  hide_empty_history_days: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoryRow = {
  id: string;
  user_id: string;
  slug: string;
  label: string;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
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
  user_id: string;
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
  user_id: string;
  date: string;
  completed: boolean;
  actual_value: number | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Supabase's required shape: all three row flavours plus relationship info. */
type Table<Row, Insert = Row, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

/** Columns the database fills in; a client insert must not send them. */
type Generated = 'id' | 'created_at' | 'updated_at';

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Omit<ProfileRow, Generated>>;
      user_settings: Table<UserSettingRow, Omit<UserSettingRow, Generated>>;
      categories: Table<CategoryRow, Omit<CategoryRow, Generated>>;
      goals: Table<GoalRow, Omit<GoalRow, Generated>>;
      daily_goal_records: Table<DailyGoalRecordRow, Omit<DailyGoalRecordRow, Generated>>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      goal_type: GoalTypeRow;
      frequency_type: FrequencyTypeRow;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
