/**
 * Database row → API row.
 *
 * The API deliberately emits the expected legacy shape.
 *
 *   - booleans: `is_active` is stored as 0/1 (legacy SQLite format) and
 *     converted back here so the client's conditionals mean what they look like.
 *   - `frequency_config`: stored as an object or JSON string.
 */

export interface DbGoal {
  id: string;
  name: string;
  description: string | null;
  goal_type: string;
  target_value: number | null;
  unit: string | null;
  target_time: string | null;
  category_id: string | null;
  frequency_type: string;
  frequency_config: string | Record<string, unknown>;
  start_date: string;
  end_date: string | null;
  reminder_time: string | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface DbRecord {
  id: string;
  goal_id: string;
  date: string;
  completed: number;
  actual_value: number | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const parseConfig = (raw: string | Record<string, unknown>): unknown => {
  if (typeof raw === 'object' && raw !== null) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

export const toGoalRow = (row: DbGoal): Record<string, unknown> => ({
  id: row.id,
  name: row.name,
  description: row.description,
  goal_type: row.goal_type,
  target_value: row.target_value,
  unit: row.unit,
  target_time: row.target_time,
  category_id: row.category_id,
  frequency_type: row.frequency_type,
  frequency_config: parseConfig(row.frequency_config),
  start_date: row.start_date,
  end_date: row.end_date,
  reminder_time: row.reminder_time,
  is_active: row.is_active === 1,
  sort_order: row.sort_order,
  created_at: row.created_at,
  updated_at: row.updated_at,
  archived_at: row.archived_at,
});

export const toRecordRow = (row: DbRecord): Record<string, unknown> => ({
  id: row.id,
  goal_id: row.goal_id,
  date: row.date,
  completed: row.completed === 1,
  actual_value: row.actual_value,
  notes: row.notes,
  completed_at: row.completed_at,
  created_at: row.created_at,
  updated_at: row.updated_at,
});
